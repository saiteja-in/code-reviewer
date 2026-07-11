import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFiles } from "../src/config/env.ts";
import { closeNeo4j } from "../src/db/neo4j.ts";
import { buildStructuralGraphFromSources } from "../src/indexer/graph-build.ts";

loadEnvFiles();

const repoId = process.env.GRAPH_FIXTURE_REPO_ID?.trim() || "graph-fixture-repo";
const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "../fixtures");

const files = readdirSync(fixturesDir)
  .filter((name) => name.endsWith(".ts"))
  .map((name) => ({
    path: `fixtures/${name}`,
    content: readFileSync(join(fixturesDir, name), "utf8"),
  }));

const result = await buildStructuralGraphFromSources({
  repositoryId: repoId,
  files,
});

console.log("Graph fixture build complete", { repoId, ...result });
console.log(
  "Verify in Neo4j Browser:\n" +
    `MATCH (m:Method {repoId:'${repoId}'}) RETURN count(m);\n` +
    `MATCH (f:File {repoId:'${repoId}'})-[:CONTAINS]->(m:Method) RETURN f.path, m.name LIMIT 10;`,
);

await closeNeo4j();
