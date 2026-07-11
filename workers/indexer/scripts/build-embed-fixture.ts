import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFiles } from "../src/config/env.ts";
import { disconnectDb } from "../src/db/client.ts";
import { ensureEmbedFixtureRepository } from "../src/indexer/embed-fixture.ts";
import { indexEmbeddingsFromSources } from "../src/indexer/embed-index.ts";

loadEnvFiles();

const commitSha = process.env.EMBED_FIXTURE_COMMIT?.trim() || "fixture-commit-sha";
const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "../fixtures");

const files = readdirSync(fixturesDir)
  .filter((name) => name.endsWith(".ts"))
  .map((name) => ({
    path: `fixtures/${name}`,
    content: readFileSync(join(fixturesDir, name), "utf8"),
  }));

const repoId = await ensureEmbedFixtureRepository();

const result = await indexEmbeddingsFromSources({
  repositoryId: repoId,
  commitSha,
  files,
});

console.log("Embedding fixture build complete", { repoId, commitSha, ...result });
console.log(
  "Verify in Postgres:\n" +
    `SELECT COUNT(*) FROM "FileChunk" WHERE "repositoryId" = '${repoId}';\n` +
    `SELECT path, symbol, "startLine", "endLine" FROM "FileChunk" WHERE "repositoryId" = '${repoId}' ORDER BY path, "startLine";`,
);

await disconnectDb();
