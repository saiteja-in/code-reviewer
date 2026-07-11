import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildReviewSystemPrompt,
  buildReviewUserPrompt,
} from "./ai.ts";

describe("buildReviewUserPrompt", () => {
  const diff = "### app.ts (modified)\n```diff\n+const x = 1;\n```";

  it("diff mode omits repository context section", () => {
    const prompt = buildReviewUserPrompt("Fix bug", diff, {
      mode: "diff",
      repoContext: {
        snippets: [
          {
            path: "other.ts",
            startLine: 1,
            endLine: 10,
            name: "caller",
            role: "impacted",
            source: "call fix()",
          },
        ],
      },
    });

    assert.match(prompt, /Changed code \(diff\)/);
    assert.doesNotMatch(prompt, /Repository context \(outside this PR\)/);
  });

  it("graph mode includes repository context, roles, and rules when provided", () => {
    const prompt = buildReviewUserPrompt("Fix bug", diff, {
      mode: "graph",
      repoContext: {
        snippets: [
          {
            path: "other.ts",
            startLine: 1,
            endLine: 10,
            name: "caller",
            role: "impacted",
            confidence: "high",
            source: "call fix()",
          },
        ],
      },
    });

    assert.match(prompt, /Repository context \(outside this PR\)/);
    assert.match(prompt, /check these first for breakage/);
    assert.match(prompt, /other\.ts:1-10 \(impacted, CALLS confidence=high\)/);
    assert.match(prompt, /Graph-mode rules:/);
    assert.match(prompt, /inline comment `file`\/`line` on diff lines only/);
  });

  it("graph mode without context matches diff-style prompt body", () => {
    const diffPrompt = buildReviewUserPrompt("Fix bug", diff, { mode: "diff" });
    const graphPrompt = buildReviewUserPrompt("Fix bug", diff, { mode: "graph" });

    assert.equal(graphPrompt, diffPrompt);
  });
});

describe("buildReviewSystemPrompt", () => {
  const repoContext = {
    snippets: [
      {
        path: "other.ts",
        startLine: 1,
        endLine: 10,
        name: "caller",
        role: "impacted" as const,
        source: "call fix()",
      },
    ],
  };

  it("diff mode uses diff-only system prompt", () => {
    const prompt = buildReviewSystemPrompt({ mode: "diff", repoContext });
    assert.match(prompt, /Analyze the provided pull request diff/);
    assert.doesNotMatch(prompt, /Repository context/);
  });

  it("graph mode with context uses cross-file workflow system prompt", () => {
    const prompt = buildReviewSystemPrompt({ mode: "graph", repoContext });
    assert.match(prompt, /cross-file bugs and breaking changes/);
    assert.match(prompt, /inspect \*\*impacted\*\* context snippets first/);
    assert.match(prompt, /Cross-file breakage/);
    assert.match(prompt, /Raise \*\*riskScore\*\*/);
  });

  it("graph mode without snippets falls back to diff system prompt", () => {
    const prompt = buildReviewSystemPrompt({ mode: "graph" });
    assert.match(prompt, /Analyze the provided pull request diff/);
    assert.doesNotMatch(prompt, /cross-file bugs/);
  });
});
