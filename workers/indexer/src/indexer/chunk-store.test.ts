import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadEnvFiles } from "../config/env.ts";
import { disconnectDb } from "../db/client.ts";
import { buildChunksFromFiles } from "./chunk.ts";
import { countFileChunks, replaceFileChunks } from "./chunk-store.ts";
import { ensureEmbedFixtureRepository } from "./embed-fixture.ts";

loadEnvFiles();

const commitSha = process.env.EMBED_FIXTURE_COMMIT?.trim() || "fixture-commit-sha";
const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "../../fixtures");

function loadFixtureFiles() {
  return readdirSync(fixturesDir)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => ({
      path: `fixtures/${name}`,
      content: readFileSync(join(fixturesDir, name), "utf8"),
    }));
}

function fakeEmbedding(seed: number): number[] {
  const vector = new Array<number>(1024);
  for (let i = 0; i < vector.length; i += 1) {
    vector[i] = Math.sin(seed + i);
  }
  return vector;
}

async function ensureFixtureRepository(): Promise<string> {
  return ensureEmbedFixtureRepository();
}

describe("replaceFileChunks", { skip: !process.env.DATABASE_URL }, () => {
  it("replaces chunks for a repository", async () => {
    const repoId = await ensureFixtureRepository();
    const sourceChunks = buildChunksFromFiles(loadFixtureFiles());
    const chunks = sourceChunks.map((chunk, index) => ({
      ...chunk,
      embedding: fakeEmbedding(index + 1),
    }));

    const written = await replaceFileChunks(repoId, commitSha, chunks);
    assert.equal(written, chunks.length);

    const count = await countFileChunks(repoId);
    assert.equal(count, chunks.length);

    await disconnectDb();
  });
});
