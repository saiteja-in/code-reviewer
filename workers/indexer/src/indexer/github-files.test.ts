import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { shouldIndexPath } from "./github-files.ts";

describe("shouldIndexPath", () => {
  it("includes TypeScript sources and excludes node_modules", () => {
    assert.equal(shouldIndexPath("src/services/user.ts"), true);
    assert.equal(shouldIndexPath("src/components/App.tsx"), true);
    assert.equal(shouldIndexPath("node_modules/foo/index.ts"), false);
    assert.equal(shouldIndexPath("dist/bundle.js"), false);
    assert.equal(shouldIndexPath("types/global.d.ts"), false);
  });
});
