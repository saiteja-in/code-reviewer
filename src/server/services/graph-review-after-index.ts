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
  /** Existing PENDING review to update instead of creating a new row. */
  existingReviewId?: string;
};

export type SchedulePrReviewResult = {
  reviewId: string;
  reviewQueued: boolean;
  message: string;
};

/**
 * Create or refresh a review row and queue review-pr when appropriate.
 * Graph mode: queue only after index is ready; otherwise leave PENDING for index-repo to trigger.
 */
export async function schedulePrReview(
  input: SchedulePrReviewInput,
): Promise<SchedulePrReviewResult> {
  const indexReady = await isRepositoryIndexedForCommit(
    input.repositoryId,
    input.headSha,
  );
  const deferForIndex = shouldDeferGraphReviewUntilIndex(input.mode, indexReady);

  let reviewId = input.existingReviewId;

  if (reviewId) {
    await db.review.update({
      where: { id: reviewId },
      data: {
        headSha: input.headSha,
        prTitle: input.prTitle,
        mode: input.mode,
      },
    });
  } else {
    const review = await db.review.create({
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
    reviewId = review.id;
  }

  if (deferForIndex) {
    const indexNote =
      input.indexResult?.queued === true
        ? "Index job queued"
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
    message: input.mode === "graph" ? "Review triggered after index" : "Review triggered",
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
