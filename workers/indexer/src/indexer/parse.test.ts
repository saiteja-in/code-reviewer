import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseFile } from "../indexer/parse.ts";

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/sample-service.ts",
);

describe("parseFile (TypeScript)", () => {
  it("extracts class, interface, methods, and function symbols", () => {
    const content = readFileSync(fixturePath, "utf8");
    const result = parseFile("fixtures/sample-service.ts", content);

    const classSymbol = result.nodes.find(
      (n) => n.kind === "Class" && n.name === "UserService",
    );
    assert.ok(classSymbol);
    assert.equal(classSymbol.qualifiedName, "UserService");
    assert.equal(classSymbol.startLine, 1);

    const findMethod = result.nodes.find(
      (n) => n.qualifiedName === "UserService.find",
    );
    assert.ok(findMethod);
    assert.equal(findMethod.kind, "Method");
    assert.ok(findMethod.startLine >= 2 && findMethod.endLine >= 4);

    const iface = result.nodes.find(
      (n) => n.kind === "Interface" && n.name === "UserStore",
    );
    assert.ok(iface);

    const factory = result.nodes.find((n) => n.name === "createUserService");
    assert.ok(factory);
    assert.equal(factory?.kind, "Method");
  });

  it("captures call references for heuristic call resolution", () => {
    const content = readFileSync(fixturePath, "utf8");
    const result = parseFile("fixtures/sample-service.ts", content);

    const selfCall = result.refs.find(
      (ref) => ref.name === "find" && ref.line === 7,
    );
    assert.ok(selfCall);

    const constructorCall = result.refs.find(
      (ref) => ref.name === "UserService" && ref.line === 16,
    );
    assert.ok(constructorCall);
  });
});
