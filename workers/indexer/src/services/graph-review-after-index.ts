import { db } from "../db/client.ts";
import { inngest } from "../inngest/client.ts";

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

    await inngest.send({
      name: "review/pr.requested",
      data: {
        reviewId: review.id,
        repositoryId: input.repositoryId,
        prNumber: review.prNumber,
        userId: review.userId,
        headSha: review.headSha,
        mode: review.mode,
        installationId,
      },
    });
  }

  return { triggered: pending.length };
}

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
