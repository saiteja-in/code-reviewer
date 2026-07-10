import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  branchFromRef,
  isBranchDelete,
  parseOwnerRepo,
} from "./github-webhook-index.ts";

describe("parseOwnerRepo", () => {
  it("splits owner and repo", () => {
    assert.deepEqual(parseOwnerRepo("octocat/hello"), {
      owner: "octocat",
      repo: "hello",
    });
  });

  it("returns null for invalid names", () => {
    assert.equal(parseOwnerRepo("invalid"), null);
  });
});

describe("branchFromRef", () => {
  it("strips refs/heads prefix", () => {
    assert.equal(branchFromRef("refs/heads/main"), "main");
  });
});

describe("isBranchDelete", () => {
  it("detects zero sha", () => {
    assert.equal(isBranchDelete("0000000000000000000000000000000000000000"), true);
    assert.equal(isBranchDelete("abc123"), false);
  });
});
