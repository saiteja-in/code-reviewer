import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadEnvFiles } from "../config/env.ts";
import { closeNeo4j, runRead } from "../db/neo4j.ts";
import { buildStructuralGraphFromSources } from "./graph-build.ts";

loadEnvFiles();

const repoId = process.env.GRAPH_FIXTURE_REPO_ID?.trim() || "graph-fixture-repo";
const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "../../fixtures");

function loadFixtureFiles() {
  return readdirSync(fixturesDir)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => ({
      path: `fixtures/${name}`,
      content: readFileSync(join(fixturesDir, name), "utf8"),
    }));
}

describe("buildStructuralGraphFromSources (Neo4j)", { skip: !process.env.NEO4J_URI }, () => {
  it("writes structural nodes plus IMPORTS and CALLS edges", async () => {
    const files = loadFixtureFiles();
    const result = await buildStructuralGraphFromSources({
      repositoryId: repoId,
      files,
    });

    assert.ok(result.nodesWritten > 0);
    assert.ok(result.edgesWritten > 0);
    assert.ok(result.importEdges >= 1);
    assert.ok(result.callEdges >= 1);

    const methodCount = await runRead<{ count: number }>(
      "MATCH (m:Method {repoId: $repoId}) RETURN count(m) AS count",
      { repoId },
    );
    assert.ok(Number(methodCount[0]?.count) > 0);

    const containsRows = await runRead<{ path: string; name: string }>(
      `MATCH (f:File {repoId: $repoId})-[:CONTAINS]->(m:Method)
       RETURN f.path AS path, m.name AS name
       LIMIT 10`,
      { repoId },
    );
    assert.ok(containsRows.length > 0);

    const importRows = await runRead<{ fromPath: string; toPath: string }>(
      `MATCH (a:File {repoId: $repoId})-[:IMPORTS]->(b:File {repoId: $repoId})
       RETURN a.path AS fromPath, b.path AS toPath`,
      { repoId },
    );
    assert.ok(
      importRows.some(
        (r) =>
          r.fromPath.includes("user-controller") &&
          r.toPath.includes("sample-service"),
      ),
    );

    const callRows = await runRead<{
      caller: string;
      callee: string;
      confidence: string;
    }>(
      `MATCH (caller:Method {repoId: $repoId})-[c:CALLS]->(callee:Method {repoId: $repoId})
       RETURN caller.qualifiedName AS caller, callee.qualifiedName AS callee, c.confidence AS confidence`,
      { repoId },
    );
    assert.ok(callRows.length >= 1);
    assert.ok(
      callRows.some(
        (r) =>
          r.caller.includes("UserService.delete") &&
          r.callee.includes("UserService.find"),
      ),
    );

    await closeNeo4j();
  });
});
