import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getCommentableLines,
  mapInlineComments,
  buildCommentableLineIndex,
} from "./diff-line-mapper.ts";

const SAMPLE_PATCH = `@@ -10,3 +10,4 @@ export function foo() {
 context line
-old line
+added line
+another added`;

describe("getCommentableLines", () => {
  it("includes context and added lines on the RIGHT side", () => {
    const lines = getCommentableLines(SAMPLE_PATCH);
    assert.ok(lines.has(10), "context at new line 10");
    assert.ok(lines.has(11), "added line 11");
    assert.ok(lines.has(12), "added line 12");
    assert.equal(lines.has(13), false);
  });
});

describe("mapInlineComments", () => {
  const files = [{ filename: "src/foo.ts", patch: SAMPLE_PATCH }];

  it("maps valid comments to inline GitHub format", () => {
    const { inline, offDiff } = mapInlineComments(
      [
        {
          file: "src/foo.ts",
          line: 11,
          severity: "high",
          category: "bug",
          message: "Issue here",
        },
      ],
      files,
      (c) => c.message,
    );

    assert.equal(inline.length, 1);
    assert.equal(offDiff.length, 0);
    assert.equal(inline[0]?.path, "src/foo.ts");
    assert.equal(inline[0]?.line, 11);
    assert.equal(inline[0]?.side, "RIGHT");
  });

  it("moves off-diff lines to offDiff", () => {
    const { inline, offDiff } = mapInlineComments(
      [
        {
          file: "src/foo.ts",
          line: 99,
          severity: "low",
          category: "style",
          message: "Not in diff",
        },
      ],
      files,
      (c) => c.message,
    );

    assert.equal(inline.length, 0);
    assert.equal(offDiff.length, 1);
    assert.equal(offDiff[0]?.reason, "line_not_in_diff");
  });

  it("moves unknown files to offDiff", () => {
    const { inline, offDiff } = mapInlineComments(
      [
        {
          file: "other.ts",
          line: 1,
          severity: "low",
          category: "style",
          message: "Wrong file",
        },
      ],
      files,
      (c) => c.message,
    );

    assert.equal(inline.length, 0);
    assert.equal(offDiff[0]?.reason, "file_not_in_pr");
  });
});

describe("buildCommentableLineIndex", () => {
  it("indexes multiple files", () => {
    const index = buildCommentableLineIndex([
      { filename: "a.ts", patch: "@@ -1 +1 @@\n+line" },
      { filename: "b.ts" },
    ]);
    assert.ok(index.has("a.ts"));
    assert.equal(index.has("b.ts"), false);
  });
});
