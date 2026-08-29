import { db } from "@/server/db";
import { inngest } from "@/server/inngest";

export type RequestRepoIndexInput = {
  repositoryId: string;
  installationId?: number | null;
  owner: string;
  repo: string;
  headSha: string;
  branch: string;
  baseCommit?: string | null;
};

export type RequestRepoIndexResult =
  | { queued: true; jobId: string }
  | { queued: false; reason: string; jobId?: string };

/** Pending/processing jobs older than this are treated as stuck and re-queued. */
const STALE_INDEX_JOB_MS = 10 * 60 * 1000;

function isStale(createdAt: Date, updatedAt?: Date): boolean {
  const anchor = updatedAt ?? createdAt;
  return Date.now() - anchor.getTime() > STALE_INDEX_JOB_MS;
}

async function sendIndexRequestedEvent(input: {
  repositoryId: string;
  jobId: string;
  installationId?: number | null;
  owner: string;
  repo: string;
  headSha: string;
  branch: string;
  baseCommit?: string | null;
}): Promise<void> {
  await inngest.send({
    name: "repo/index.requested",
    data: {
      repositoryId: input.repositoryId,
      jobId: input.jobId,
      installationId: input.installationId ?? null,
      owner: input.owner,
      repo: input.repo,
      headSha: input.headSha,
      branch: input.branch,
      baseCommit: input.baseCommit ?? null,
    },
  });
}

/**
 * Enqueue a repo index job (Inngest → indexer worker).
 * Dedupes in-flight jobs and skips when head is already indexed.
 * Re-sends events for stuck/pending jobs so a missed worker pickup can recover.
 */
export async function requestRepoIndex(
  input: RequestRepoIndexInput,
): Promise<RequestRepoIndexResult> {
  const repository = await db.repository.findUnique({
    where: { id: input.repositoryId },
    select: { indexedCommit: true, indexStatus: true },
  });

  if (
    repository?.indexStatus === "ready" &&
    repository.indexedCommit === input.headSha
  ) {
    return {
      queued: false,
      reason: "Repository already indexed at this commit",
    };
  }

  const inFlightSameHead = await db.indexJob.findFirst({
    where: {
      repositoryId: input.repositoryId,
      headCommit: input.headSha,
      status: { in: ["pending", "processing"] },
    },
    orderBy: { createdAt: "desc" },
  });

  if (inFlightSameHead) {
    if (
      inFlightSameHead.status === "processing" &&
      !isStale(inFlightSameHead.createdAt, inFlightSameHead.updatedAt)
    ) {
      return {
        queued: false,
        reason: "Index job already in progress for this commit",
        jobId: inFlightSameHead.id,
      };
    }

    // Pending jobs (or stale processing) often mean the Inngest event was lost
    // while the worker was reconnecting — mark stale processing failed and re-send.
    if (
      inFlightSameHead.status === "processing" &&
      isStale(inFlightSameHead.createdAt, inFlightSameHead.updatedAt)
    ) {
      await db.indexJob.update({
        where: { id: inFlightSameHead.id },
        data: {
          status: "failed",
          error: "Stale processing job — re-queued",
        },
      });
    } else {
      await sendIndexRequestedEvent({
        repositoryId: input.repositoryId,
        jobId: inFlightSameHead.id,
        installationId: input.installationId,
        owner: input.owner,
        repo: input.repo,
        headSha: input.headSha,
        branch: input.branch,
        baseCommit: input.baseCommit,
      });

      return {
        queued: true,
        jobId: inFlightSameHead.id,
      };
    }
  }

  const inFlightOtherHead = await db.indexJob.findFirst({
    where: {
      repositoryId: input.repositoryId,
      headCommit: { not: input.headSha },
      status: { in: ["pending", "processing"] },
    },
    orderBy: { createdAt: "desc" },
  });

  if (
    inFlightOtherHead?.status === "processing" &&
    !isStale(inFlightOtherHead.createdAt, inFlightOtherHead.updatedAt)
  ) {
    return {
      queued: false,
      reason: "Index job already in progress for another commit",
      jobId: inFlightOtherHead.id,
    };
  }

  if (inFlightOtherHead) {
    await db.indexJob.update({
      where: { id: inFlightOtherHead.id },
      data: {
        status: "failed",
        error: `Superseded by newer index request for ${input.headSha.slice(0, 7)}`,
      },
    });
  }

  // A completed IndexJob for this SHA only means "done" if the repo is actually
  // ready at that commit. Otherwise Neo4j/chunks may have moved on — re-index.
  const duplicateCompleted = await db.indexJob.findFirst({
    where: {
      repositoryId: input.repositoryId,
      headCommit: input.headSha,
      status: "completed",
    },
    orderBy: { createdAt: "desc" },
  });

  if (
    duplicateCompleted &&
    repository?.indexStatus === "ready" &&
    repository.indexedCommit === input.headSha
  ) {
    return {
      queued: false,
      reason: "Index job already exists for this commit",
      jobId: duplicateCompleted.id,
    };
  }

  const job = await db.indexJob.create({
    data: {
      repositoryId: input.repositoryId,
      status: "pending",
      headCommit: input.headSha,
      branch: input.branch,
      baseCommit: input.baseCommit ?? null,
    },
  });

  await sendIndexRequestedEvent({
    repositoryId: input.repositoryId,
    jobId: job.id,
    installationId: input.installationId,
    owner: input.owner,
    repo: input.repo,
    headSha: input.headSha,
    branch: input.branch,
    baseCommit: input.baseCommit,
  });

  return { queued: true, jobId: job.id };
}

export function parseOwnerRepo(fullName: string): { owner: string; repo: string } | null {
  const [owner, repo] = fullName.split("/");
  if (!owner || !repo) {
    return null;
  }
  return { owner, repo };
}

export function branchFromRef(ref: string): string {
  return ref.replace(/^refs\/heads\//, "");
}

/** GitHub uses all-zero SHA when a branch is deleted. */
export function isBranchDelete(afterSha: string): boolean {
  return /^0+$/.test(afterSha);
}
