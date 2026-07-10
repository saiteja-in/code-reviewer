export type ReviewMode = "diff" | "graph";

/** Default review mode from env — `diff` unless REVIEW_MODE=graph. */
export function reviewModeFromEnv(): ReviewMode {
  return process.env.REVIEW_MODE === "graph" ? "graph" : "diff";
}

/** Resolve mode for a new review: explicit override wins, else env default. */
export function resolveReviewMode(
  override?: ReviewMode | string | null,
): ReviewMode {
  if (override === "graph" || override === "diff") {
    return override;
  }
  return reviewModeFromEnv();
}

export function isReviewMode(value: string): value is ReviewMode {
  return value === "diff" || value === "graph";
}
