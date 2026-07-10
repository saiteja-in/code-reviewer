import { inngest } from "../client";
import { db } from "@/server/db";
import { reviewCode } from "@/server/services/ai";
import { getInstallationAccessToken } from "@/server/services/github-app";
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

async function resolveWriteAccessToken(
  userId: string,
  installationId: number | null | undefined,
): Promise<string | null> {
  if (installationId) {
    try {
      return await getInstallationAccessToken(installationId);
    } catch (err) {
      console.warn(
        "Installation token unavailable, falling back to user OAuth:",
        err instanceof Error ? err.message : err,
      );
    }
  }
  return getGitHubAccessToken(userId);
}

async function resolveInstallationId(
  eventInstallationId: number | null | undefined,
  repositoryId: string,
): Promise<number | null> {
  if (eventInstallationId) {
    return eventInstallationId;
  }

  const repo = await db.repository.findUnique({
    where: { id: repositoryId },
    include: { installation: true },
  });

  if (repo?.installation?.installationId) {
    return Number(repo.installation.installationId);
  }

  return null;
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

      const installationId = await resolveInstallationId(
        eventData.installationId,
        review.repositoryId,
      );
      const writeToken = await resolveWriteAccessToken(
        eventData.userId,
        installationId,
      );
      if (!writeToken) {
        return;
      }

      try {
        await updateCheckRun(
          writeToken,
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

    const fetchToken = await step.run("get-fetch-token", async () => {
      return getGitHubAccessToken(userId);
    });

    if (!fetchToken) {
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

    const installationId = await step.run("resolve-installation-id", async () => {
      return resolveInstallationId(event.data.installationId, repositoryId);
    });

    const writeToken = await step.run("get-write-token", async () => {
      return resolveWriteAccessToken(userId, installationId);
    });

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
      if (!writeToken) {
        return null;
      }

      try {
        const checkRun = await createCheckRun(writeToken, owner, repo, {
          headSha: pr.head.sha,
          detailsUrl: appPrUrl,
        });

        await db.review.update({
          where: { id: reviewId },
          data: { checkRunId: BigInt(checkRun.id) },
        });

        return checkRun.id;
      } catch (err) {
        console.warn(
          "Could not create check run (missing Checks permission?):",
          err instanceof Error ? err.message : err,
        );
        return null;
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

    const postToken = writeToken ?? fetchToken;

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
            postToken,
            owner,
            repo,
            prNumber,
            {
              commitId: pr.head.sha,
              body,
              comments: inline,
            },
          );

          if (checkRunId) {
            const output = checkRunOutputFromReview(reviewResult);
            await updateCheckRun(postToken, owner, repo, checkRunId, {
              conclusion: checkRunConclusionFromReview(reviewResult),
              title: output.title,
              summary: output.summary,
              detailsUrl: appPrUrl,
            });
          }

          if (process.env.GITHUB_USE_COMMIT_STATUS === "1") {
            const status = statusFromReview(reviewResult);
            await createCommitStatus(
              postToken,
              owner,
              repo,
              pr.head.sha,
              {
                ...status,
                targetUrl: appPrUrl,
              },
            );
          }

          return {
            success: true,
            githubReviewId: BigInt(posted.id),
            githubReviewUrl: posted.html_url,
            commitStatusSha: pr.head.sha,
            checkRunId: checkRunId ? BigInt(checkRunId) : undefined,
          };
        } catch (err) {
          const message =
            err instanceof GitHubApiError
              ? `${err.status}: ${err.message}${err.body ? ` — ${err.body.slice(0, 200)}` : ""}`
              : err instanceof Error
                ? err.message
                : "Unknown error posting to GitHub";

          if (checkRunId) {
            try {
              await updateCheckRun(postToken, owner, repo, checkRunId, {
                conclusion: "failure",
                title: "Failed to post review",
                summary: message,
                detailsUrl: appPrUrl,
              });
            } catch {
              // ignore secondary failure
            }
          }

          if (
            err instanceof GitHubApiError &&
            (err.status === 404 || err.status === 422)
          ) {
            return { success: false, postError: message, checkRunId: checkRunId ? BigInt(checkRunId) : undefined };
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
          checkRunId:
            postResult.checkRunId ??
            (checkRunId != null ? BigInt(checkRunId) : null),
          postError: postResult.postError ?? null,
        },
      });
    });

    return { success: true, reviewId, postedToGithub: postResult.success };
  },
);
