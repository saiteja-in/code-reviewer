import { db } from "@/server/db";
import { queueReviewJob } from "@/server/services/review-queue";
import { resolveReviewMode, type ReviewMode } from "@/server/services/review-mode";
import type { RequestRepoIndexResult } from "@/server/services/github-webhook-index";
import { shouldDeferGraphReviewUntilIndex } from "@/server/services/graph-review-scheduling";

export async function isRepositoryIndexedForCommit(
  repositoryId: string,
  headSha: string,
): Promise<boolean> {
  const repo = await db.repository.findUnique({
    where: { id: repositoryId },
    select: { indexStatus: true, indexedCommit: true },
  });

  return repo?.indexStatus === "ready" && repo.indexedCommit === headSha;
}

export type SchedulePrReviewInput = {
  repositoryId: string;
  userId: string;
  prNumber: number;
  prTitle: string;
  prUrl: string;
  headSha: string;
  mode: ReviewMode;
  installationId: number | null;
  indexResult: RequestRepoIndexResult | null;
  /** Existing review to update instead of creating a new row. */
  existingReviewId?: string;
};

export type SchedulePrReviewResult = {
  reviewId: string;
  reviewQueued: boolean;
  message: string;
};

const REVIEW_RESET_FIELDS = {
  status: "PENDING" as const,
  summary: null,
  riskScore: null,
  comments: null,
  error: null,
  githubReviewId: null,
  githubReviewUrl: null,
  checkRunId: null,
  postedAt: null,
  commitStatusSha: null,
  postError: null,
};

/** Reviews stuck in PROCESSING longer than this can be re-queued. */
const STALE_PROCESSING_MS = 15 * 60 * 1000;

function isStaleProcessing(updatedAt: Date): boolean {
  return Date.now() - updatedAt.getTime() > STALE_PROCESSING_MS;
}

/**
 * Create or refresh a review row and queue review-pr when appropriate.
 * Graph mode: queue only after index is ready; otherwise leave PENDING for index-repo to trigger.
 *
 * Reuses the unique (repositoryId, prNumber, headSha, mode) row on re-run instead of inserting again.
 */
export async function schedulePrReview(
  input: SchedulePrReviewInput,
): Promise<SchedulePrReviewResult> {
  const indexReady = await isRepositoryIndexedForCommit(
    input.repositoryId,
    input.headSha,
  );
  const deferForIndex = shouldDeferGraphReviewUntilIndex(input.mode, indexReady);

  const existingById = input.existingReviewId
    ? await db.review.findUnique({ where: { id: input.existingReviewId } })
    : null;

  const existingByKey = await db.review.findUnique({
    where: {
      repositoryId_prNumber_headSha_mode: {
        repositoryId: input.repositoryId,
        prNumber: input.prNumber,
        headSha: input.headSha,
        mode: input.mode,
      },
    },
  });

  // Prefer the unique-key row for this commit. Only fall back to existingReviewId
  // when it is for the same head (or has no head yet) so we do not violate the unique index.
  const existing =
    existingByKey ??
    (existingById &&
    (existingById.headSha === input.headSha || existingById.headSha == null)
      ? existingById
      : null);

  // If webhook passed a PENDING row for an older head, abandon it so the new
  // commit can create/reuse its own review row.
  if (
    existingById &&
    !existing &&
    existingById.headSha &&
    existingById.headSha !== input.headSha &&
    existingById.status === "PENDING"
  ) {
    await db.review.update({
      where: { id: existingById.id },
      data: {
        status: "FAILED",
        error: `Superseded by newer head ${input.headSha.slice(0, 7)}`,
      },
    });
  }

  if (
    existing?.status === "PROCESSING" &&
    !isStaleProcessing(existing.updatedAt)
  ) {
    return {
      reviewId: existing.id,
      reviewQueued: false,
      message: "Review already in progress",
    };
  }

  const review = existing
    ? await db.review.update({
        where: { id: existing.id },
        data: {
          ...REVIEW_RESET_FIELDS,
          headSha: input.headSha,
          prTitle: input.prTitle,
          prUrl: input.prUrl,
          mode: input.mode,
        },
      })
    : await db.review.create({
        data: {
          repositoryId: input.repositoryId,
          userId: input.userId,
          prNumber: input.prNumber,
          prTitle: input.prTitle,
          prUrl: input.prUrl,
          headSha: input.headSha,
          mode: input.mode,
          status: "PENDING",
        },
      });

  const reviewId = review.id;

  if (deferForIndex) {
    const indexNote =
      input.indexResult?.queued === true
        ? "Index job queued / re-sent"
        : (input.indexResult?.reason ?? "Waiting for repository index");
    return {
      reviewId,
      reviewQueued: false,
      message: `Review waiting for index (${indexNote})`,
    };
  }

  if (!input.installationId) {
    throw new Error("GitHub App installation required to queue review");
  }

  await queueReviewJob({
    reviewId,
    repositoryId: input.repositoryId,
    prNumber: input.prNumber,
    userId: input.userId,
    headSha: input.headSha,
    mode: input.mode,
    installationId: input.installationId,
  });

  return {
    reviewId,
    reviewQueued: true,
    message: existing
      ? "Review re-queued"
      : input.mode === "graph"
        ? "Review triggered after index"
        : "Review triggered",
  };
}

/** Start review-pr for graph-mode reviews waiting on a completed index. */
export async function triggerPendingGraphReviewsForCommit(input: {
  repositoryId: string;
  headSha: string;
}): Promise<{ triggered: number }> {
  const repository = await db.repository.findUnique({
    where: { id: input.repositoryId },
    include: { installation: true },
  });

  if (!repository?.installation?.installationId) {
    return { triggered: 0 };
  }

  const installationId = Number(repository.installation.installationId);
  const pending = await db.review.findMany({
    where: {
      repositoryId: input.repositoryId,
      headSha: input.headSha,
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

  for (const review of pending) {
    if (!review.headSha) {
      continue;
    }

    await queueReviewJob({
      reviewId: review.id,
      repositoryId: input.repositoryId,
      prNumber: review.prNumber,
      userId: review.userId,
      headSha: review.headSha,
      mode: resolveReviewMode(review.mode),
      installationId,
    });
  }

  return { triggered: pending.length };
}

/** Fail graph-mode reviews that were waiting on a failed index job. */
export async function failPendingGraphReviewsForCommit(input: {
  repositoryId: string;
  headSha: string;
  error: string;
}): Promise<{ failed: number }> {
  const result = await db.review.updateMany({
    where: {
      repositoryId: input.repositoryId,
      headSha: input.headSha,
      mode: "graph",
      status: "PENDING",
    },
    data: {
      status: "FAILED",
      error: `Repository index failed: ${input.error}`,
    },
  });

  return { failed: result.count };
}
