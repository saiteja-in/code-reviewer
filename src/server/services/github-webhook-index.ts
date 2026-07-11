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

/**
 * Enqueue a repo index job (Inngest → indexer worker).
 * Dedupes in-flight jobs and skips when head is already indexed.
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
    return {
      queued: false,
      reason: "Index job already in progress for this commit",
      jobId: inFlightSameHead.id,
    };
  }

  const inFlightOtherHead = await db.indexJob.findFirst({
    where: {
      repositoryId: input.repositoryId,
      headCommit: { not: input.headSha },
      status: { in: ["pending", "processing"] },
    },
    orderBy: { createdAt: "desc" },
  });

  if (inFlightOtherHead?.status === "processing") {
    return {
      queued: false,
      reason: "Index job already in progress for another commit",
      jobId: inFlightOtherHead.id,
    };
  }

  if (inFlightOtherHead?.status === "pending") {
    await db.indexJob.update({
      where: { id: inFlightOtherHead.id },
      data: {
        status: "failed",
        error: `Superseded by newer index request for ${input.headSha.slice(0, 7)}`,
      },
    });
  }

  const duplicateHead = await db.indexJob.findFirst({
    where: {
      repositoryId: input.repositoryId,
      headCommit: input.headSha,
      status: { in: ["pending", "processing", "completed"] },
    },
    orderBy: { createdAt: "desc" },
  });

  if (duplicateHead) {
    return {
      queued: false,
      reason: "Index job already exists for this commit",
      jobId: duplicateHead.id,
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

  await inngest.send({
    name: "repo/index.requested",
    data: {
      repositoryId: input.repositoryId,
      jobId: job.id,
      installationId: input.installationId ?? null,
      owner: input.owner,
      repo: input.repo,
      headSha: input.headSha,
      branch: input.branch,
      baseCommit: input.baseCommit ?? null,
    },
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
