import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  collectImportsForFiles,
  resolveRelativeImport,
} from "./imports.ts";

describe("resolveRelativeImport", () => {
  const known = new Set([
    "fixtures/sample-service.ts",
    "fixtures/user-controller.ts",
  ]);

  it("resolves relative paths to known fixture files", () => {
    assert.equal(
      resolveRelativeImport(
        "fixtures/user-controller.ts",
        "./sample-service",
        known,
      ),
      "fixtures/sample-service.ts",
    );
  });

  it("returns null for package imports", () => {
    assert.equal(
      resolveRelativeImport("fixtures/user-controller.ts", "lodash", known),
      null,
    );
  });
});

describe("collectImportsForFiles", () => {
  it("parses named imports between fixture files", () => {
    const imports = collectImportsForFiles([
      {
        path: "fixtures/user-controller.ts",
        content: `import { createUserService } from "./sample-service";\nexport function handleUser() {}`,
      },
      {
        path: "fixtures/sample-service.ts",
        content: `export function createUserService() { return {}; }`,
      },
    ]);

    const edge = imports.find(
      (i) =>
        i.path === "fixtures/user-controller.ts" &&
        i.resolvedPath === "fixtures/sample-service.ts",
    );
    assert.ok(edge);
    assert.equal(edge?.bindings[0]?.localName, "createUserService");
  });
});
