import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyContextBudget,
  buildRetrievalQuery,
  extractChangedPaths,
} from "./context-assembler-budget.ts";

describe("extractChangedPaths", () => {
  it("includes modified and added files but skips removed", () => {
    const paths = extractChangedPaths([
      { filename: "src/a.ts", status: "modified", patch: "+x" },
      { filename: "src/b.ts", status: "added", patch: "+y" },
      { filename: "src/old.ts", status: "removed" },
    ]);

    assert.deepEqual(paths.sort(), ["src/a.ts", "src/b.ts"]);
  });
});

describe("buildRetrievalQuery", () => {
  it("includes PR title, changed paths, and patch excerpt", () => {
    const query = buildRetrievalQuery("Fix user service", [
      {
        filename: "src/user.ts",
        status: "modified",
        patch: "+export function broken() {}",
      },
    ]);

    assert.match(query, /Fix user service/);
    assert.match(query, /src\/user\.ts/);
    assert.match(query, /broken/);
  });
});

describe("applyContextBudget", () => {
  it("prioritizes impacted snippets and enforces limits", () => {
    const { snippets, dropped } = applyContextBudget([
      {
        path: "src/related.ts",
        startLine: 1,
        endLine: 5,
        name: "relatedFn",
        role: "related",
        priority: 40,
        source: "related code",
      },
      {
        path: "src/caller.ts",
        startLine: 10,
        endLine: 20,
        name: "callerFn",
        role: "impacted",
        priority: 100,
        source: "calls changed method",
      },
    ]);

    assert.equal(snippets.length, 2);
    assert.equal(snippets[0]?.role, "impacted");
    assert.equal(dropped.length, 0);
  });

  it("drops lower-priority snippets when snippet limit reached", () => {
    const originalMax = process.env.CONTEXT_MAX_SNIPPETS;
    process.env.CONTEXT_MAX_SNIPPETS = "1";

    try {
      const { snippets, dropped } = applyContextBudget([
        {
          path: "src/high.ts",
          startLine: 1,
          endLine: 2,
          name: "high",
          role: "impacted",
          priority: 100,
          source: "high priority",
        },
        {
          path: "src/low.ts",
          startLine: 3,
          endLine: 4,
          name: "low",
          role: "related",
          priority: 10,
          source: "low priority",
        },
      ]);

      assert.equal(snippets.length, 1);
      assert.equal(snippets[0]?.path, "src/high.ts");
      assert.ok(dropped.some((entry) => entry.includes("snippet limit")));
    } finally {
      if (originalMax === undefined) {
        delete process.env.CONTEXT_MAX_SNIPPETS;
      } else {
        process.env.CONTEXT_MAX_SNIPPETS = originalMax;
      }
    }
  });
});
