import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { shouldDeferGraphReviewUntilIndex } from "./graph-review-scheduling.ts";

describe("shouldDeferGraphReviewUntilIndex", () => {
  it("defers graph reviews when index is not ready", () => {
    assert.equal(shouldDeferGraphReviewUntilIndex("graph", false), true);
  });

  it("does not defer graph reviews when index is ready", () => {
    assert.equal(shouldDeferGraphReviewUntilIndex("graph", true), false);
  });

  it("never defers diff reviews", () => {
    assert.equal(shouldDeferGraphReviewUntilIndex("diff", false), false);
    assert.equal(shouldDeferGraphReviewUntilIndex("diff", true), false);
  });
});
