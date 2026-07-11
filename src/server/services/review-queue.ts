import { inngest } from "@/server/inngest";
import type { ReviewMode } from "@/server/services/review-mode";

export type QueueReviewInput = {
  reviewId: string;
  repositoryId: string;
  prNumber: number;
  userId: string;
  headSha: string;
  mode: ReviewMode;
  installationId?: number | null;
};

/** Enqueue the durable review-pr Inngest function. */
export async function queueReviewJob(input: QueueReviewInput) {
  return inngest.send({
    name: "review/pr.requested",
    data: {
      reviewId: input.reviewId,
      repositoryId: input.repositoryId,
      prNumber: input.prNumber,
      userId: input.userId,
      headSha: input.headSha,
      mode: input.mode,
      installationId: input.installationId ?? null,
    },
  });
}
