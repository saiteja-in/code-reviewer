#!/usr/bin/env node
/**
 * Dry-run golden eval scoring against evals/golden-context.json.
 * Live A/B results belong in docs/POC_RESULTS.md after running diff vs graph reviews.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const goldenPath = resolve(process.cwd(), "evals/golden-context.json");
const golden = JSON.parse(readFileSync(goldenPath, "utf8"));

console.log(`Golden eval file: ${goldenPath}`);
console.log(`Cases: ${golden.cases.length}`);
console.log("");

for (const testCase of golden.cases) {
  console.log(`- ${testCase.id}: ${testCase.description}`);
  if (testCase.expectContext?.mustIncludePaths?.length) {
    console.log(
      `  context must include: ${testCase.expectContext.mustIncludePaths.join(", ")}`,
    );
  }
  if (testCase.expectGraphReview?.mustMentionExternalPath) {
    console.log(
      `  graph review must mention: ${testCase.expectGraphReview.mustMentionExternalPath}`,
    );
  }
}

console.log("");
console.log("Run automated scoring:");
console.log("  pnpm eval:golden");
console.log("");
console.log("Live A/B checklist:");
console.log("  1. Index repo at PR head (graph-fixture or real repo)");
console.log("  2. Trigger review mode=diff and mode=graph on same commit");
console.log("  3. Record results in docs/POC_RESULTS.md");
