import { inngest } from "../client";
import { db } from "@/server/db";
import { reviewCode } from "@/server/services/ai";
import {
  GITHUB_APP_INSTALLATION_REQUIRED,
  requireInstallationAccessToken,
} from "@/server/services/github-app";
import { resolveGitHubInstallationId } from "@/server/services/github-webhook-installation";
import {
  fetchPullRequest,
  fetchPullRequestFiles,
  getGitHubAccessToken,
  postPullRequestReview,
  createCommitStatus,
  createCheckRun,
  updateCheckRun,
  GitHubApiError,
} from "@/server/services/github";
import { mapInlineComments } from "@/server/services/diff-line-mapper";
import {
  buildReviewBody,
  buildInlineCommentBody,
  statusFromReview,
  checkRunConclusionFromReview,
  checkRunOutputFromReview,
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
  checkRunId?: bigint;
  postError?: string;
}

export const reviewPR = inngest.createFunction(
  {
    id: "review-pr",
    retries: 2,
    triggers: [{ event: "review/pr.requested" }],
    onFailure: async ({ event, error }) => {
      const eventData = event.data.event.data as ReviewPREvent["data"];
      const { reviewId } = eventData;

      const review = await db.review.findUnique({
        where: { id: reviewId },
        include: { repository: { include: { installation: true } } },
      });

      await db.review.update({
        where: { id: reviewId },
        data: { status: "FAILED", error: error.message || "Review failed" },
      });

      if (!review?.checkRunId || !review.repository) {
        return;
      }

      const [owner, repoName] = review.repository.fullName.split("/");
      if (!owner || !repoName) {
        return;
      }

      const installationId = await resolveGitHubInstallationId(
        review.repositoryId,
        eventData.installationId,
      );

      try {
        const botToken = await requireInstallationAccessToken(installationId);
        await updateCheckRun(
          botToken,
          owner,
          repoName,
          review.checkRunId,
          {
            conclusion: "failure",
            title: "AI review failed",
            summary: error.message || "Review failed",
          },
        );
      } catch (updateErr) {
        console.error("Failed to update check run on failure:", updateErr);
      }
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
        include: { installation: true },
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

    const installationId = await step.run("resolve-installation-id", async () => {
      return resolveGitHubInstallationId(
        repositoryId,
        event.data.installationId,
      );
    });

    const botTokenResult = await step.run("get-bot-token", async () => {
      try {
        const token = await requireInstallationAccessToken(installationId);
        return { ok: true as const, token };
      } catch (err) {
        return {
          ok: false as const,
          error:
            err instanceof Error
              ? err.message
              : GITHUB_APP_INSTALLATION_REQUIRED,
        };
      }
    });

    if (!botTokenResult.ok) {
      await step.run("mark-failed-no-bot", async () => {
        await db.review.update({
          where: { id: reviewId },
          data: {
            status: "FAILED",
            error: botTokenResult.error,
            postError: botTokenResult.error,
          },
        });
      });
      return { success: false, error: botTokenResult.error };
    }

    const botToken = botTokenResult.token;

    const fetchToken = await step.run("get-fetch-token", async () => {
      return getGitHubAccessToken(userId);
    });

    if (!fetchToken) {
      await step.run("mark-failed-no-fetch-token", async () => {
        await db.review.update({
          where: { id: reviewId },
          data: {
            status: "FAILED",
            error:
              "GitHub OAuth token not found — connect GitHub in the dashboard to fetch PR data",
          },
        });
      });
      return {
        success: false,
        error: "GitHub access token not found for fetch",
      };
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

    const pr = await step.run("fetch-pr", async () => {
      return fetchPullRequest(fetchToken, owner, repo, prNumber);
    });

    const appBase = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
    const appPrUrl = appBase
      ? `${appBase}/repos/${repositoryId}/pr/${prNumber}`
      : undefined;

    const checkRunId = await step.run("create-check-run", async () => {
      try {
        const checkRun = await createCheckRun(botToken, owner, repo, {
          headSha: pr.head.sha,
          detailsUrl: appPrUrl,
        });

        await db.review.update({
          where: { id: reviewId },
          data: { checkRunId: BigInt(checkRun.id) },
        });

        return checkRun.id;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create check run";
        throw new Error(`Check run creation failed: ${message}`);
      }
    });

    const files = await step.run("fetch-pr-files", async () => {
      return fetchPullRequestFiles(fetchToken, owner, repo, prNumber);
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
            botToken,
            owner,
            repo,
            prNumber,
            {
              commitId: pr.head.sha,
              body,
              comments: inline,
            },
          );

          const output = checkRunOutputFromReview(reviewResult);
          await updateCheckRun(botToken, owner, repo, checkRunId, {
            conclusion: checkRunConclusionFromReview(reviewResult),
            title: output.title,
            summary: output.summary,
            detailsUrl: appPrUrl,
          });

          if (process.env.GITHUB_USE_COMMIT_STATUS === "1") {
            const status = statusFromReview(reviewResult);
            await createCommitStatus(botToken, owner, repo, pr.head.sha, {
              ...status,
              targetUrl: appPrUrl,
            });
          }

          return {
            success: true,
            githubReviewId: BigInt(posted.id),
            githubReviewUrl: posted.html_url,
            commitStatusSha: pr.head.sha,
            checkRunId: BigInt(checkRunId),
          };
        } catch (err) {
          const message =
            err instanceof GitHubApiError
              ? `${err.status}: ${err.message}${err.body ? ` — ${err.body.slice(0, 200)}` : ""}`
              : err instanceof Error
                ? err.message
                : "Unknown error posting to GitHub";

          try {
            await updateCheckRun(botToken, owner, repo, checkRunId, {
              conclusion: "failure",
              title: "Failed to post review",
              summary: message,
              detailsUrl: appPrUrl,
            });
          } catch {
            // ignore secondary failure
          }

          if (
            err instanceof GitHubApiError &&
            (err.status === 404 || err.status === 422)
          ) {
            return {
              success: false,
              postError: message,
              checkRunId: BigInt(checkRunId),
            };
          }

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
          checkRunId: postResult.checkRunId ?? BigInt(checkRunId),
          postError: postResult.postError ?? null,
        },
      });
    });

    return { success: true, reviewId, postedToGithub: postResult.success };
  },
);
