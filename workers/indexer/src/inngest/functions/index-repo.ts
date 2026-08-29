import { db } from "../../db/client.ts";
import { logger } from "../../lib/logger.ts";
import { inngest } from "../client.ts";
import type { IndexRepoEvent } from "../events.ts";
import {
  resolveIndexPlan,
  runRepositoryIndex,
} from "../../indexer/index-incremental.ts";
import {
  failPendingGraphReviewsForCommit,
} from "../../services/graph-review-after-index.ts";

async function markJobProcessing(jobId: string | undefined): Promise<void> {
  if (!jobId) return;
  await db.indexJob.update({
    where: { id: jobId },
    data: { status: "processing" },
  });
}

async function markJobCompleted(
  jobId: string | undefined,
  headSha: string | undefined,
  branch: string | undefined,
): Promise<void> {
  if (!jobId) return;
  await db.indexJob.update({
    where: { id: jobId },
    data: {
      status: "completed",
      headCommit: headSha ?? null,
      branch: branch ?? null,
    },
  });
}

/** Indexer — graph + embeddings with full or incremental re-index (Steps 16–20). */
export const indexRepo = inngest.createFunction(
  {
    id: "index-repo",
    retries: 2,
    triggers: [{ event: "repo/index.requested" }],
    concurrency: [{ key: "event.data.repositoryId", limit: 1 }],
    onFailure: async ({ event, error }) => {
      const data = event.data.event.data as IndexRepoEvent["data"];
      if (data.jobId) {
        await db.indexJob.update({
          where: { id: data.jobId },
          data: {
            status: "failed",
            error: error.message || "Index job failed",
          },
        });
      }
      await db.repository.update({
        where: { id: data.repositoryId },
        data: { indexStatus: "failed" },
      });

      if (data.headSha) {
        await failPendingGraphReviewsForCommit({
          repositoryId: data.repositoryId,
          headSha: data.headSha,
          error: error.message || "Index job failed",
        });
      }
    },
  },
  async ({ event, step }) => {
    const {
      repositoryId,
      jobId,
      headSha,
      branch,
      installationId,
      owner,
      repo,
      baseCommit,
    } = event.data;

    await step.run("mark-indexing", async () => {
      await markJobProcessing(jobId);
      await db.repository.update({
        where: { id: repositoryId },
        data: { indexStatus: "indexing" },
      });
    });

    const indexResult = await step.run("index-repository", async () => {
      if (!installationId || !owner || !repo || !headSha) {
        throw new Error(
          "Missing installationId, owner, repo, or headSha for repository index",
        );
      }

      const plan = await resolveIndexPlan({
        repositoryId,
        installationId,
        owner,
        repo,
        headSha,
        baseCommit,
      });

      return runRepositoryIndex(
        {
          repositoryId,
          installationId,
          owner,
          repo,
          headSha,
          baseCommit,
        },
        plan,
      );
    });

    await step.run("mark-ready", async () => {
      await db.repository.update({
        where: { id: repositoryId },
        data: {
          indexStatus: "ready",
          indexedCommit: headSha ?? null,
          indexedBranch: branch ?? null,
        },
      });
      await markJobCompleted(jobId, headSha, branch);
    });

    if (headSha) {
      await step.sendEvent("emit-index-completed", {
        name: "repo/index.completed",
        data: {
          repositoryId,
          headSha,
          jobId,
          branch: branch ?? null,
        },
      });

      const pendingReviews = await step.run("load-pending-graph-reviews", async () => {
        const repository = await db.repository.findUnique({
          where: { id: repositoryId },
          include: { installation: true },
        });

        if (!repository?.installation?.installationId) {
          logger.warn("index-repo: no installation — cannot trigger reviews", {
            repositoryId,
            headSha,
          });
          return [] as Array<{
            reviewId: string;
            prNumber: number;
            userId: string;
            headSha: string;
            mode: string;
            installationId: number;
          }>;
        }

        const installationId = Number(repository.installation.installationId);
        const pending = await db.review.findMany({
          where: {
            repositoryId,
            headSha,
            mode: "graph",
            status: "PENDING",
          },
          select: {
            id: true,
            prNumber: true,
            userId: true,
            headSha: true,
            mode: true,
          },
        });

        logger.info("index-repo: pending graph reviews to trigger", {
          repositoryId,
          headSha,
          count: pending.length,
          reviewIds: pending.map((r) => r.id),
        });

        return pending
          .filter((review) => Boolean(review.headSha))
          .map((review) => ({
            reviewId: review.id,
            prNumber: review.prNumber,
            userId: review.userId,
            headSha: review.headSha!,
            mode: review.mode,
            installationId,
          }));
      });

      if (pendingReviews.length > 0) {
        await step.sendEvent(
          "trigger-graph-reviews",
          pendingReviews.map((review) => ({
            name: "review/pr.requested" as const,
            data: {
              reviewId: review.reviewId,
              repositoryId,
              prNumber: review.prNumber,
              userId: review.userId,
              headSha: review.headSha,
              mode: review.mode,
              installationId: review.installationId,
            },
          })),
        );
      }
    }

    logger.info("index-repo: completed", {
      repositoryId,
      mode: indexResult.mode,
      reason: indexResult.reason,
      changedPaths: indexResult.changedPaths.length,
      removedPaths: indexResult.removedPaths.length,
      ...indexResult.graph,
      ...indexResult.embed,
    });

    return { success: true, repositoryId, ...indexResult };
  },
);
