import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildInlineCommentBody,
  buildReviewBody,
  statusFromReview,
  checkRunConclusionFromReview,
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

describe("checkRunConclusionFromReview", () => {
  it("returns failure for critical", () => {
    assert.equal(
      checkRunConclusionFromReview({
        ...baseReview,
        comments: [
          {
            file: "a.ts",
            line: 1,
            severity: "critical",
            category: "bug",
            message: "crash",
          },
        ],
      }),
      "failure",
    );
  });

  it("returns neutral for high severity", () => {
    assert.equal(
      checkRunConclusionFromReview({
        ...baseReview,
        comments: [
          {
            file: "a.ts",
            line: 1,
            severity: "high",
            category: "bug",
            message: "bug",
          },
        ],
      }),
      "neutral",
    );
  });

  it("returns success when only low/medium", () => {
    assert.equal(
      checkRunConclusionFromReview({
        ...baseReview,
        comments: [
          {
            file: "a.ts",
            line: 1,
            severity: "medium",
            category: "style",
            message: "nit",
          },
        ],
      }),
      "success",
    );
  });
});

describe("buildInlineCommentBody", () => {
  it("uses P label, title, impact, and suggestion fence", () => {
    const body = buildInlineCommentBody({
      file: "auth.ts",
      line: 42,
      severity: "high",
      category: "security",
      title: "Unvalidated email input",
      message: "The handler uses req.body.email without validation.",
      impact: "Invalid input can reach the database layer.",
      suggestion: 'const email = validateEmail(req.body.email);',
    });

    assert.match(body, /\*\*P1 · Security\*\* — Unvalidated email input/);
    assert.match(body, /without validation/);
    assert.match(body, /\*\*Why it matters:\*\* Invalid input/);
    assert.match(body, /```suggestion/);
    assert.match(body, /validateEmail/);
    assert.doesNotMatch(body, /\*\*Suggestion:\*\*/);
  });

  it("derives title from first sentence when title omitted", () => {
    const body = buildInlineCommentBody({
      file: "a.ts",
      line: 1,
      severity: "medium",
      category: "bug",
      message: "Missing null check. This can crash at runtime.",
    });

    assert.match(body, /\*\*P2 · Bug\*\* — Missing null check/);
    assert.match(body, /This can crash at runtime/);
  });

  it("uses four-backtick fence when suggestion contains triple backticks", () => {
    const body = buildInlineCommentBody({
      file: "readme.md",
      line: 10,
      severity: "low",
      category: "style",
      title: "Fix fenced block",
      message: "Use four ticks for nested fences.",
      suggestion: "```\ncode\n```",
    });

    assert.match(body, /````suggestion/);
    assert.match(body, /````\s*$/m);
  });
});

describe("buildReviewBody", () => {
  it("wraps content in collapsible details with summary line", () => {
    const body = buildReviewBody(baseReview);
    assert.match(body, /<details>/);
    assert.match(body, /<\/details>/);
    assert.match(body, /<summary>.*AI Code Review.*No issues found/s);
    assert.match(body, /Looks good overall/);
    assert.match(body, /risk \*\*20\/100\*\*/);
  });

  it("includes P0/P1 action table for critical and high findings", () => {
    const body = buildReviewBody({
      summary: "Issues found.",
      riskScore: 60,
      comments: [
        {
          file: "auth.ts",
          line: 42,
          severity: "critical",
          category: "security",
          title: "SQL injection",
          message: "User input in query.",
        },
        {
          file: "api.ts",
          line: 18,
          severity: "high",
          category: "bug",
          title: "Missing error handling",
          message: "Errors are swallowed.",
        },
        {
          file: "util.ts",
          line: 5,
          severity: "low",
          category: "style",
          message: "Rename variable.",
        },
      ],
    });

    assert.match(body, /### Action required/);
    assert.match(body, /\| P0 \| `auth\.ts:42` \| SQL injection \|/);
    assert.match(body, /\| P1 \| `api\.ts:18` \| Missing error handling \|/);
    assert.match(body, /### Findings overview/);
    assert.match(body, /\| P0 \| 1 \|/);
    assert.match(body, /\| P1 \| 1 \|/);
    assert.match(body, /\| P3 \| 1 \|/);
    assert.match(body, /1 P0 issue/);
  });

  it("includes re-run marker in summary when requested", () => {
    const body = buildReviewBody(baseReview, { isRerun: true });
    assert.match(body, /re-run/);
  });

  it("lists off-diff comments with plain-language reasons", () => {
    const body = buildReviewBody(baseReview, {
      offDiffComments: [
        {
          file: "x.ts",
          line: 5,
          severity: "medium",
          category: "bug",
          title: "Off diff finding",
          message: "Details here.",
          reason: "line_not_in_diff",
        },
        {
          file: "y.ts",
          line: 1,
          severity: "high",
          category: "security",
          message: "File missing from PR.",
          reason: "file_not_in_pr",
        },
      ],
    });

    assert.match(body, /Additional findings \(not on diff\)/);
    assert.match(body, /P2 · `x\.ts:5`/);
    assert.match(body, /line not in diff/);
    assert.match(body, /file not in PR/);
    assert.doesNotMatch(body, /not posted inline/);
  });
});
