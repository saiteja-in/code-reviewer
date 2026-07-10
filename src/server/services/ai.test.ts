import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildReviewUserPrompt } from "./ai.ts";

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
    assert.doesNotMatch(prompt, /Relevant code from the rest of the repository/);
  });

  it("graph mode includes repository context when provided", () => {
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
            source: "call fix()",
          },
        ],
      },
    });

    assert.match(prompt, /Relevant code from the rest of the repository/);
    assert.match(prompt, /other\.ts:1-10 \(impacted\)/);
    assert.match(prompt, /breaks code OUTSIDE the diff/);
  });

  it("graph mode without context matches diff-style prompt body", () => {
    const diffPrompt = buildReviewUserPrompt("Fix bug", diff, { mode: "diff" });
    const graphPrompt = buildReviewUserPrompt("Fix bug", diff, { mode: "graph" });

    assert.equal(graphPrompt, diffPrompt);
  });
});
