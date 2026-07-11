import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFile } from "./parse.ts";
import { collectGraphFromParse } from "./graph-write.ts";
import { parentClassName, symbolNodeId } from "./graph-ids.ts";

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/sample-service.ts",
);

describe("collectGraphFromParse", () => {
  it("builds File, Class, Method nodes and CONTAINS/DECLARES edges", () => {
    const content = readFileSync(fixturePath, "utf8");
    const path = "fixtures/sample-service.ts";
    const repoId = "repo-test-16";
    const parsed = parseFile(path, content);
    const graph = collectGraphFromParse(repoId, path, parsed);

    const fileNode = graph.nodes.find((n) => n.kind === "File");
    assert.ok(fileNode);
    assert.equal(fileNode.path, path);

    const userService = graph.nodes.find(
      (n) => n.kind === "Class" && n.name === "UserService",
    );
    assert.ok(userService);

    const findMethod = graph.nodes.find(
      (n) => n.kind === "Method" && n.qualifiedName === "UserService.find",
    );
    assert.ok(findMethod);
    assert.equal(findMethod.id, symbolNodeId(repoId, parsed.nodes.find((n) => n.qualifiedName === "UserService.find")!));

    const containsClass = graph.edges.find(
      (e) =>
        e.type === "CONTAINS" &&
        e.fromId === fileNode.id &&
        e.toId === userService.id,
    );
    assert.ok(containsClass);

    const declaresMethod = graph.edges.find(
      (e) =>
        e.type === "DECLARES" &&
        e.fromId === userService.id &&
        e.toId === findMethod!.id,
    );
    assert.ok(declaresMethod);

    const fileContainsMethod = graph.edges.find(
      (e) =>
        e.type === "CONTAINS" &&
        e.fromId === fileNode.id &&
        e.toId === findMethod!.id,
    );
    assert.ok(fileContainsMethod);
  });
});

describe("parentClassName", () => {
  it("returns enclosing class for qualified members", () => {
    assert.equal(parentClassName("UserService.find", "find"), "UserService");
    assert.equal(parentClassName("createUserService", "createUserService"), null);
  });
});
