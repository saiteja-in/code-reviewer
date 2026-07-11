import { db } from "../../db/client.ts";
import { logger } from "../../lib/logger.ts";
import { buildStructuralGraph } from "../../indexer/graph-build.ts";
import { inngest } from "../client.ts";
import type { IndexRepoEvent } from "../events.ts";

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

/** Indexer — structural graph (Step 16+); SCIP in Step 18. */
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
    const { repositoryId, jobId, headSha, branch, installationId, owner, repo } =
      event.data;

    await step.run("mark-indexing", async () => {
      await markJobProcessing(jobId);
      await db.repository.update({
        where: { id: repositoryId },
        data: { indexStatus: "indexing" },
      });
    });

    const graphResult = await step.run("build-structural-graph", async () => {
      if (!installationId || !owner || !repo || !headSha) {
        throw new Error(
          "Missing installationId, owner, repo, or headSha for structural graph build",
        );
      }

      return buildStructuralGraph({
        repositoryId,
        installationId,
        owner,
        repo,
        headSha,
      });
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
      ...graphResult,
    });

    return { success: true, repositoryId, ...graphResult };
  },
);
