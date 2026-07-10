import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { reviewModeFromEnv } from "./github-webhook.ts";

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
