import { db } from "../../db/client.ts";
import { logger } from "../../lib/logger.ts";
import { inngest } from "../client.ts";
import type { IndexRepoEvent } from "../events.ts";
import {
  resolveIndexPlan,
  runRepositoryIndex,
} from "../../indexer/index-incremental.ts";

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
