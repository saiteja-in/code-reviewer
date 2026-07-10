import { inngest } from "../client";
import { db } from "@/server/db";
import { reviewCode } from "@/server/services/ai";
import {
  fetchPullRequest,
  fetchPullRequestFiles,
  getGitHubAccessToken,
  postPullRequestReview,
  createCommitStatus,
  GitHubApiError,
} from "@/server/services/github";
import { mapInlineComments } from "@/server/services/diff-line-mapper";
import {
  buildReviewBody,
  buildInlineCommentBody,
  statusFromReview,
} from "@/server/services/review-format";

export type ReviewPREvent = {
  name: "review/pr.requested";
  data: {
    reviewId: string;
    repositoryId: string;
    prNumber: number;
    userId: string;
    headSha?: string | null;
    mode?: string;
    installationId?: number | null;
  };
};

interface PostToGithubResult {
  success: boolean;
  githubReviewId?: bigint;
  githubReviewUrl?: string;
  commitStatusSha?: string;
  postError?: string;
}

export const reviewPR = inngest.createFunction(
  {
    id: "review-pr",
    retries: 2,
    triggers: [{ event: "review/pr.requested" }],
    onFailure: async ({ event, error }) => {
      const reviewId = (event.data.event.data as ReviewPREvent["data"])
        .reviewId;
      await db.review.update({
        where: { id: reviewId },
        data: { status: "FAILED", error: error.message || "Review failed" },
      });
    },
  },
  async ({ event, step }) => {
    const { reviewId, repositoryId, prNumber, userId } = event.data;

    await step.run("update-status-processing", async () => {
      await db.review.update({
        where: { id: reviewId },
        data: { status: "PROCESSING" },
      });
    });

    const repository = await step.run("get-repository", async () => {
      return db.repository.findUnique({
        where: { id: repositoryId },
      });
    });

    if (!repository) {
      await step.run("mark-failed-no-repo", async () => {
        await db.review.update({
          where: { id: reviewId },
          data: { status: "FAILED", error: "No repository found" },
        });
      });
      return { success: false, error: "No repository found" };
    }

    const accessToken = await step.run("get-access-token", async () => {
      return getGitHubAccessToken(userId);
    });

    if (!accessToken) {
      await step.run("mark-failed-no-token", async () => {
        await db.review.update({
          where: { id: reviewId },
          data: {
            status: "FAILED",
            error: "GitHub access token not found",
          },
        });
      });
      return { success: false, error: "GitHub access token not found" };
    }

    const [owner, repo] = repository.fullName.split("/");
    if (!owner || !repo) {
      await step.run("mark-failed-invalid-repo", async () => {
        await db.review.update({
          where: { id: reviewId },
          data: {
            status: "FAILED",
            error: "Invalid repository name",
          },
        });
      });
      return { success: false, error: "Invalid repository name" };
    }

    const files = await step.run("fetch-pr-files", async () => {
      return fetchPullRequestFiles(accessToken, owner, repo, prNumber);
    });

    const pr = await step.run("fetch-pr", async () => {
      return fetchPullRequest(accessToken, owner, repo, prNumber);
    });

    const reviewResult = await step.run("generate-review", async () => {
      return reviewCode(
        pr.title,
        files.map((f) => ({
          filename: f.filename,
          status: f.status,
          additions: f.additions,
          deletions: f.deletions,
          patch: f.patch,
        })),
      );
    });

    await step.run("save-review-result", async () => {
      await db.review.update({
        where: { id: reviewId },
        data: {
          status: "COMPLETED",
          summary: reviewResult.summary,
          riskScore: reviewResult.riskScore,
          comments: reviewResult.comments,
        },
      });
    });

    const priorPostedCount = await step.run("count-prior-posted", async () => {
      return db.review.count({
        where: {
          repositoryId,
          prNumber,
          id: { not: reviewId },
          postedAt: { not: null },
        },
      });
    });

    const postResult = await step.run(
      "post-to-github",
      async (): Promise<PostToGithubResult> => {
        const appBase = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
        const appPrUrl = appBase
          ? `${appBase}/repos/${repositoryId}/pr/${prNumber}`
          : undefined;

        const { inline, offDiff } = mapInlineComments(
          reviewResult.comments,
          files.map((f) => ({ filename: f.filename, patch: f.patch })),
          buildInlineCommentBody,
        );

        const body = buildReviewBody(reviewResult, {
          offDiffComments: offDiff,
          isRerun: priorPostedCount > 0,
          appPrUrl,
        });

        try {
          const posted = await postPullRequestReview(
            accessToken,
            owner,
            repo,
            prNumber,
            {
              commitId: pr.head.sha,
              body,
              comments: inline,
            },
          );

          const status = statusFromReview(reviewResult);
          await createCommitStatus(
            accessToken,
            owner,
            repo,
            pr.head.sha,
            {
              ...status,
              targetUrl: appPrUrl,
            },
          );

          return {
            success: true,
            githubReviewId: BigInt(posted.id),
            githubReviewUrl: posted.html_url,
            commitStatusSha: pr.head.sha,
          };
        } catch (err) {
          const message =
            err instanceof GitHubApiError
              ? `${err.status}: ${err.message}${err.body ? ` — ${err.body.slice(0, 200)}` : ""}`
              : err instanceof Error
                ? err.message
                : "Unknown error posting to GitHub";

          // Non-fatal: analysis succeeded; don't rethrow for retries on 404/422.
          if (
            err instanceof GitHubApiError &&
            (err.status === 404 || err.status === 422)
          ) {
            return { success: false, postError: message };
          }

          // Retry transient errors (rate limits, 5xx).
          throw err;
        }
      },
    );

    await step.run("save-github-post", async () => {
      await db.review.update({
        where: { id: reviewId },
        data: {
          githubReviewId: postResult.githubReviewId ?? null,
          githubReviewUrl: postResult.githubReviewUrl ?? null,
          postedAt: postResult.success ? new Date() : null,
          commitStatusSha: postResult.commitStatusSha ?? null,
          postError: postResult.postError ?? null,
        },
      });
    });

    return { success: true, reviewId, postedToGithub: postResult.success };
  },
);
