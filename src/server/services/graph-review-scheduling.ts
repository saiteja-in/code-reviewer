import type { ReviewMode } from "@/server/services/review-mode";

/** Graph reviews defer until index completes unless the repo is already indexed at PR head. */
export function shouldDeferGraphReviewUntilIndex(
  mode: ReviewMode,
  indexReady: boolean,
): boolean {
  return mode === "graph" && !indexReady;
}
