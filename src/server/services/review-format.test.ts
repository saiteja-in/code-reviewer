import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildReviewBody,
  statusFromReview,
  RISK_FAIL_THRESHOLD,
} from "./review-format.ts";
import type { ReviewResult } from "./ai.ts";

const baseReview: ReviewResult = {
  summary: "Looks good overall.",
  riskScore: 20,
  comments: [],
};

describe("statusFromReview", () => {
  it("returns success when no issues", () => {
    const status = statusFromReview(baseReview);
    assert.equal(status.state, "success");
    assert.match(status.description, /No issues/);
  });

  it("returns failure on critical finding", () => {
    const status = statusFromReview({
      ...baseReview,
      comments: [
        {
          file: "a.ts",
          line: 1,
          severity: "critical",
          category: "security",
          message: "Leak",
        },
      ],
    });
    assert.equal(status.state, "failure");
  });

  it("returns failure when risk exceeds threshold", () => {
    const status = statusFromReview({
      ...baseReview,
      riskScore: RISK_FAIL_THRESHOLD,
      comments: [
        {
          file: "a.ts",
          line: 1,
          severity: "low",
          category: "style",
          message: "nit",
        },
      ],
    });
    assert.equal(status.state, "failure");
  });
});

describe("buildReviewBody", () => {
  it("includes summary and footer", () => {
    const body = buildReviewBody(baseReview);
    assert.match(body, /Looks good overall/);
    assert.match(body, /risk \*\*20\/100\*\*/);
  });

  it("includes re-run header when requested", () => {
    const body = buildReviewBody(baseReview, { isRerun: true });
    assert.match(body, /re-run @/);
  });

  it("lists off-diff comments", () => {
    const body = buildReviewBody(baseReview, {
      offDiffComments: [
        {
          file: "x.ts",
          line: 5,
          severity: "medium",
          category: "bug",
          message: "Off diff",
          reason: "line_not_in_diff",
        },
      ],
    });
    assert.match(body, /not posted inline/);
    assert.match(body, /Off diff/);
  });
});
