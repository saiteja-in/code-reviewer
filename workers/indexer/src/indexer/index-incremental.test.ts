import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { planChangedPaths, type CompareFileChange } from "./github-compare.ts";
import { chooseIndexPlan } from "./index-incremental.ts";

describe("planChangedPaths", () => {
  it("collects added/modified TS paths and removed renames", () => {
    const files: CompareFileChange[] = [
      { path: "src/a.ts", status: "modified" },
      { path: "src/b.ts", status: "added" },
      { path: "src/old.ts", status: "removed" },
      {
        path: "src/renamed.ts",
        status: "renamed",
        previousPath: "src/previous.ts",
      },
      { path: "README.md", status: "modified" },
    ];

    const plan = planChangedPaths(files);
    assert.deepEqual(plan.addedOrModified.sort(), ["src/a.ts", "src/b.ts", "src/renamed.ts"]);
    assert.deepEqual(plan.removed.sort(), ["src/old.ts", "src/previous.ts"]);
  });
});

describe("chooseIndexPlan", () => {
  it("uses incremental mode for small diffs", () => {
    const plan = chooseIndexPlan({
      addedOrModified: ["src/a.ts"],
      removed: [],
    });

    assert.equal(plan.mode, "incremental");
  });

  it("falls back to full index for large diffs", () => {
    const paths = Array.from({ length: 100 }, (_, index) => `src/f${index}.ts`);
    const plan = chooseIndexPlan({
      addedOrModified: paths,
      removed: [],
    });

    assert.equal(plan.mode, "full");
  });
});
