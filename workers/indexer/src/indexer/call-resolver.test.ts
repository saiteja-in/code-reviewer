import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { collectImportsForFiles } from "./imports.ts";
import { parseFile } from "./parse.ts";
import {
  buildImportEdges,
  resolveCallEdges,
  type FileParseBundle,
} from "./call-resolver.ts";

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures",
);

function loadFixtures(): FileParseBundle[] {
  return ["sample-service.ts", "user-controller.ts"].map((name) => {
    const path = `fixtures/${name}`;
    const content = readFileSync(join(fixturesDir, name), "utf8");
    return { path, parseResult: parseFile(path, content) };
  });
}

describe("resolveCallEdges", () => {
  const repoId = "repo-test-17";

  it("resolves same-class method call UserService.delete -> find", () => {
    const samplePath = "fixtures/sample-service.ts";
    const content = readFileSync(
      join(fixturesDir, "sample-service.ts"),
      "utf8",
    );
    const bundles: FileParseBundle[] = [
      { path: samplePath, parseResult: parseFile(samplePath, content) },
    ];
    const edges = resolveCallEdges(repoId, bundles, []);

    const selfCall = edges.find(
      (e) =>
        e.confidence === "high" &&
        e.fromId.includes("UserService.delete") &&
        e.toId.includes("UserService.find"),
    );
    assert.ok(selfCall);
  });

  it("resolves cross-file call via imports", () => {
    const files = ["sample-service.ts", "user-controller.ts"].map((name) => ({
      path: `fixtures/${name}`,
      content: readFileSync(join(fixturesDir, name), "utf8"),
    }));
    const bundles: FileParseBundle[] = files.map((f) => ({
      path: f.path,
      parseResult: parseFile(f.path, f.content),
    }));
    const imports = collectImportsForFiles(files);
    const importEdges = buildImportEdges(repoId, imports);
    const callEdges = resolveCallEdges(repoId, bundles, imports);

    assert.ok(importEdges.length >= 1);
    assert.ok(
      importEdges.some(
        (e) =>
          e.fromId.includes("user-controller") &&
          e.toId.includes("sample-service"),
      ),
    );

    const crossCall = callEdges.find(
      (e) =>
        e.fromId.includes("handleUser") &&
        (e.toId.includes("createUserService") || e.toId.includes(".find")),
    );
    assert.ok(crossCall);
  });
});
