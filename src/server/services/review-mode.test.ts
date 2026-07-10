import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  resolveReviewMode,
  reviewModeFromEnv,
} from "./review-mode.ts";

describe("reviewModeFromEnv", () => {
  const original = process.env.REVIEW_MODE;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.REVIEW_MODE;
    } else {
      process.env.REVIEW_MODE = original;
    }
  });

  it("defaults to diff", () => {
    delete process.env.REVIEW_MODE;
    assert.equal(reviewModeFromEnv(), "diff");
  });

  it("returns graph when REVIEW_MODE=graph", () => {
    process.env.REVIEW_MODE = "graph";
    assert.equal(reviewModeFromEnv(), "graph");
  });
});

describe("resolveReviewMode", () => {
  const original = process.env.REVIEW_MODE;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.REVIEW_MODE;
    } else {
      process.env.REVIEW_MODE = original;
    }
  });

  it("uses override when valid", () => {
    process.env.REVIEW_MODE = "diff";
    assert.equal(resolveReviewMode("graph"), "graph");
    assert.equal(resolveReviewMode("diff"), "diff");
  });

  it("falls back to env when override invalid", () => {
    process.env.REVIEW_MODE = "graph";
    assert.equal(resolveReviewMode(undefined), "graph");
    assert.equal(resolveReviewMode("invalid"), "graph");
  });
});
