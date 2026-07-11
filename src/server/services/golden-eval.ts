import type { RepoContext, ReviewResult } from "./ai.ts";
import type { PullRequestFileInput } from "./context-assembler-budget.ts";

export type GoldenContextExpectation = {
  mustIncludePaths?: string[];
  mustIncludeRoles?: Array<"impacted" | "definition" | "related">;
  minSnippets?: number;
};

export type GoldenReviewExpectation = {
  mustMentionExternalPath?: string;
  category?: string;
  minSeverity?: "critical" | "high" | "medium" | "low";
};

export type GoldenContextCase = {
  id: string;
  description: string;
  repositoryId: string;
  prTitle: string;
  changedFiles: PullRequestFileInput[];
  expectContext?: GoldenContextExpectation;
  expectGraphReview?: GoldenReviewExpectation;
};

export type GoldenEvalFile = {
  version: number;
  description?: string;
  cases: GoldenContextCase[];
};

export type GoldenScoreResult = {
  caseId: string;
  pass: boolean;
  hits: string[];
  misses: string[];
};

const SEVERITY_RANK = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
} as const;

export function scoreGoldenContext(
  testCase: GoldenContextCase,
  context: RepoContext,
): GoldenScoreResult {
  const expect = testCase.expectContext;
  const hits: string[] = [];
  const misses: string[] = [];

  if (!expect) {
    return { caseId: testCase.id, pass: true, hits, misses };
  }

  if (expect.minSnippets !== undefined && context.snippets.length < expect.minSnippets) {
    misses.push(`Expected at least ${expect.minSnippets} snippets, got ${context.snippets.length}`);
  }

  for (const path of expect.mustIncludePaths ?? []) {
    const found = context.snippets.some((snippet) => snippet.path.includes(path));
    if (found) {
      hits.push(`path:${path}`);
    } else {
      misses.push(`Missing context path ${path}`);
    }
  }

  for (const role of expect.mustIncludeRoles ?? []) {
    const found = context.snippets.some((snippet) => snippet.role === role);
    if (found) {
      hits.push(`role:${role}`);
    } else {
      misses.push(`Missing context role ${role}`);
    }
  }

  return {
    caseId: testCase.id,
    pass: misses.length === 0,
    hits,
    misses,
  };
}

export function scoreGoldenReview(
  testCase: GoldenContextCase,
  review: ReviewResult,
): GoldenScoreResult {
  const expect = testCase.expectGraphReview;
  const hits: string[] = [];
  const misses: string[] = [];

  if (!expect) {
    return { caseId: testCase.id, pass: true, hits, misses };
  }

  const comments = review.comments ?? [];

  if (expect.mustMentionExternalPath) {
    const pattern = expect.mustMentionExternalPath.toLowerCase();
    const matched = comments.some((comment) => {
      const haystack = [
        comment.file,
        comment.message,
        comment.impact ?? "",
        comment.title ?? "",
      ]
        .join("\n")
        .toLowerCase();
      return haystack.includes(pattern);
    });

    if (matched) {
      hits.push(`external-path:${expect.mustMentionExternalPath}`);
    } else {
      misses.push(
        `No review comment mentions external path ${expect.mustMentionExternalPath}`,
      );
    }
  }

  if (expect.category) {
    const matched = comments.some((comment) => comment.category === expect.category);
    if (matched) {
      hits.push(`category:${expect.category}`);
    } else {
      misses.push(`No comment with category ${expect.category}`);
    }
  }

  if (expect.minSeverity) {
    const minRank = SEVERITY_RANK[expect.minSeverity];
    const matched = comments.some(
      (comment) => SEVERITY_RANK[comment.severity] >= minRank,
    );
    if (matched) {
      hits.push(`severity>=${expect.minSeverity}`);
    } else {
      misses.push(`No comment at or above severity ${expect.minSeverity}`);
    }
  }

  return {
    caseId: testCase.id,
    pass: misses.length === 0,
    hits,
    misses,
  };
}

export function summarizeGoldenResults(results: GoldenScoreResult[]): {
  passCount: number;
  failCount: number;
  results: GoldenScoreResult[];
} {
  const passCount = results.filter((result) => result.pass).length;
  return {
    passCount,
    failCount: results.length - passCount,
    results,
  };
}
