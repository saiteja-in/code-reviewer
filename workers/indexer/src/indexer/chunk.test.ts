import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildChunksFromFiles, formatEmbedText } from "./chunk.ts";

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures",
);

function loadFixtureFiles() {
  return readdirSync(fixturesDir)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => ({
      path: `fixtures/${name}`,
      content: readFileSync(join(fixturesDir, name), "utf8"),
    }));
}

describe("buildChunksFromFiles", () => {
  it("creates symbol-aware chunks for fixture files", () => {
    const chunks = buildChunksFromFiles(loadFixtureFiles());

    assert.ok(chunks.length >= 4);
    assert.ok(
      chunks.some(
        (chunk) =>
          chunk.path.includes("sample-service.ts") &&
          chunk.symbol === "UserService.find",
      ),
    );
    assert.ok(
      chunks.some(
        (chunk) =>
          chunk.path.includes("user-controller.ts") &&
          chunk.symbol === "handleUser",
      ),
    );
  });

  it("formats embed text with path and symbol header", () => {
    const text = formatEmbedText(
      "fixtures/sample-service.ts",
      "UserService.find",
      "find(id: string) { return id; }",
    );

    assert.match(text, /path: fixtures\/sample-service\.ts/);
    assert.match(text, /symbol: UserService\.find/);
    assert.match(text, /find\(id: string\)/);
  });
});
