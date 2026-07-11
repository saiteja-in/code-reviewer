import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  scoreGoldenContext,
  scoreGoldenReview,
  summarizeGoldenResults,
  type GoldenContextCase,
  type GoldenEvalFile,
} from "./golden-eval.ts";

function loadGoldenFile(): GoldenEvalFile {
  const filePath = resolve(process.cwd(), "evals/golden-context.json");
  return JSON.parse(readFileSync(filePath, "utf8")) as GoldenEvalFile;
}

const crossFileCase: GoldenContextCase = {
  id: "cross-file-caller-impact",
  description: "Fixture cross-file caller",
  repositoryId: "graph-fixture-repo",
  prTitle: "Change UserService.find return type",
  changedFiles: [
    {
      filename: "fixtures/sample-service.ts",
      status: "modified",
      patch: "+find(id: string): number",
    },
  ],
  expectContext: {
    mustIncludePaths: ["fixtures/user-controller.ts"],
    mustIncludeRoles: ["impacted"],
  },
  expectGraphReview: {
    mustMentionExternalPath: "user-controller",
    category: "bug",
  },
};

describe("scoreGoldenContext", () => {
  it("passes when required caller path and role are present", () => {
    const result = scoreGoldenContext(crossFileCase, {
      snippets: [
        {
          path: "fixtures/user-controller.ts",
          startLine: 1,
          endLine: 6,
          name: "handleUser",
          role: "impacted",
          source: "return service.find(id);",
        },
      ],
    });

    assert.equal(result.pass, true);
    assert.ok(result.hits.includes("path:fixtures/user-controller.ts"));
  });

  it("fails when impacted caller is missing", () => {
    const result = scoreGoldenContext(crossFileCase, { snippets: [] });
    assert.equal(result.pass, false);
    assert.ok(result.misses.length > 0);
  });
});

describe("scoreGoldenReview", () => {
  it("passes when graph review cites external caller path", () => {
    const result = scoreGoldenReview(crossFileCase, {
      summary: "Breaking change",
      riskScore: 80,
      comments: [
        {
          file: "fixtures/sample-service.ts",
          line: 2,
          severity: "high",
          category: "bug",
          message: "Return type changed",
          impact: "Breaks fixtures/user-controller.ts caller",
        },
      ],
    });

    assert.equal(result.pass, true);
  });
});

describe("golden-context.json", () => {
  it("loads cases from eval fixture file", () => {
    const golden = loadGoldenFile();
    assert.ok(golden.cases.length >= 3);
    assert.equal(golden.cases[0]?.id, "cross-file-caller-impact");
    assert.equal(golden.cases[1]?.id, "signature-param-removed");
    assert.equal(golden.cases[2]?.id, "definition-callee-contract");
  });

  it("scores all file cases against mock passing context", () => {
    const golden = loadGoldenFile();
    const results = golden.cases.map((testCase) =>
      scoreGoldenContext(testCase, {
        snippets: (testCase.expectContext?.mustIncludePaths ?? []).map((path) => ({
          path,
          startLine: 1,
          endLine: 10,
          name: "mock",
          role: testCase.expectContext?.mustIncludeRoles?.[0] ?? "related",
          source: "mock source",
        })),
      }),
    );

    const summary = summarizeGoldenResults(results);
    assert.equal(summary.failCount, 0);
  });
});
