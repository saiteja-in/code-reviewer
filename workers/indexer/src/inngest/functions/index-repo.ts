import { db } from "../../db/client.ts";
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

/** Stub indexer — replaced in Steps 16–18 with tree-sitter / SCIP. */
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
    const { repositoryId, jobId, headSha, branch } = event.data;

    await step.run("mark-indexing", async () => {
      await markJobProcessing(jobId);
      await db.repository.update({
        where: { id: repositoryId },
        data: { indexStatus: "indexing" },
      });
    });

    await step.run("mark-ready-stub", async () => {
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

    return { success: true, repositoryId, stub: true };
  },
);
