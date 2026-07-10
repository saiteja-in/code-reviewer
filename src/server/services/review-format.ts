import type { ReviewComment, ReviewResult } from "@/server/services/ai";
import type { OffDiffComment } from "@/server/services/diff-line-mapper";

export const RISK_FAIL_THRESHOLD = 75;

const SEVERITY_ORDER = ["critical", "high", "medium", "low"] as const;

const PRIORITY_LABEL: Record<ReviewComment["severity"], string> = {
  critical: "P0",
  high: "P1",
  medium: "P2",
  low: "P3",
};

const CATEGORY_LABEL: Record<ReviewComment["category"], string> = {
  bug: "Bug",
  security: "Security",
  performance: "Performance",
  style: "Style",
  suggestion: "Suggestion",
};

const PRIORITY_SORT: Record<ReviewComment["severity"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function priorityLabel(severity: ReviewComment["severity"]): string {
  return PRIORITY_LABEL[severity];
}

function categoryLabel(category: ReviewComment["category"]): string {
  return CATEGORY_LABEL[category];
}

function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

function firstSentence(text: string): string {
  const match = text.trim().match(/^[^.!?\n]+[.!?]?/);
  return match ? match[0].trim() : text.trim();
}

function commentTitle(comment: ReviewComment): string {
  if (comment.title?.trim()) return truncate(comment.title.trim(), 80);
  return truncate(firstSentence(comment.message), 80);
}

function commentDetail(comment: ReviewComment, title: string): string {
  if (comment.title?.trim()) return comment.message.trim();
  const derived = firstSentence(comment.message);
  if (derived === comment.message.trim()) return "";
  return comment.message.trim();
}

function wrapSuggestionFence(code: string): string {
  const needsFourTicks = code.includes("```");
  if (needsFourTicks) {
    return `\`\`\`\`suggestion\n${code}\n\`\`\`\``;
  }
  return `\`\`\`suggestion\n${code}\n\`\`\``;
}

export function buildInlineCommentBody(comment: ReviewComment): string {
  const title = commentTitle(comment);
  const detail = commentDetail(comment, title);
  const header = `**${priorityLabel(comment.severity)} · ${categoryLabel(comment.category)}** — ${title}`;

  const parts: string[] = [header];
  if (detail) parts.push(detail);
  if (comment.impact?.trim()) {
    parts.push(`**Why it matters:** ${comment.impact.trim()}`);
  }
  if (comment.suggestion?.trim()) {
    parts.push(wrapSuggestionFence(comment.suggestion.trim()));
  }

  return parts.join("\n\n");
}

function countBySeverity(comments: ReviewComment[]): Record<string, number> {
  const counts: Record<string, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };

  for (const c of comments) {
    counts[c.severity] = (counts[c.severity] ?? 0) + 1;
  }

  return counts;
}

function walkthroughSummaryLine(review: ReviewResult): string {
  const counts = countBySeverity(review.comments);
  const p0 = counts.critical;
  const p1 = counts.high;

  if (p0 > 0) {
    const label = p0 === 1 ? "1 P0 issue" : `${p0} P0 issues`;
    return `⚠️ ${label} — address before merge`;
  }
  if (p1 > 0) {
    const label = p1 === 1 ? "1 P1 issue" : `${p1} P1 issues`;
    return `⚠️ ${label} found`;
  }
  if (review.riskScore >= RISK_FAIL_THRESHOLD) {
    return `⚠️ Risk **${review.riskScore}/100** exceeds threshold`;
  }
  if (review.comments.length === 0) {
    return "✅ No issues found";
  }
  return `✅ ${review.comments.length} finding(s) — risk **${review.riskScore}/100**`;
}

function actionRequiredTable(comments: ReviewComment[]): string {
  const actionable = comments
    .filter((c) => c.severity === "critical" || c.severity === "high")
    .sort((a, b) => {
      const p = PRIORITY_SORT[a.severity] - PRIORITY_SORT[b.severity];
      if (p !== 0) return p;
      const fileCmp = a.file.localeCompare(b.file);
      if (fileCmp !== 0) return fileCmp;
      return a.line - b.line;
    });

  if (actionable.length === 0) return "";

  const rows = actionable.map((c) => {
    const issue = commentTitle(c);
    return `| ${priorityLabel(c.severity)} | \`${c.file}:${c.line}\` | ${issue} |`;
  });

  return `### Action required\n\n| Priority | Location | Issue |\n| --- | --- | --- |\n${rows.join("\n")}`;
}

function findingsOverviewTable(comments: ReviewComment[]): string {
  const counts = countBySeverity(comments);
  const rows = SEVERITY_ORDER.filter((s) => counts[s] > 0).map(
    (s) => `| ${priorityLabel(s)} | ${counts[s]} |`,
  );

  if (rows.length === 0) return "";

  return `### Findings overview\n\n| Priority | Count |\n| --- | --- |\n${rows.join("\n")}`;
}

function offDiffReasonText(reason: OffDiffComment["reason"]): string {
  return reason === "file_not_in_pr" ? "file not in PR" : "line not in diff";
}

function formatOffDiffSection(offDiff: OffDiffComment[]): string {
  if (offDiff.length === 0) return "";

  const lines = offDiff.map((c) => {
    const title = commentTitle(c);
    const reason = offDiffReasonText(c.reason);
    let text = `- **${priorityLabel(c.severity)} · \`${c.file}:${c.line}\`** — ${title} _(${reason})_`;
    const detail = commentDetail(c, title);
    if (detail) text += `\n  ${detail}`;
    if (c.suggestion?.trim()) {
      text += `\n\n  \`\`\`\n  ${c.suggestion.trim()}\n  \`\`\``;
    }
    return text;
  });

  return `### Additional findings (not on diff)\n\n${lines.join("\n\n")}`;
}

function buildWalkthroughContent(
  review: ReviewResult,
  offDiffComments: OffDiffComment[],
): string {
  const parts: string[] = [`### Summary\n\n${review.summary}`];

  const action = actionRequiredTable(review.comments);
  if (action) parts.push(action);

  const overview = findingsOverviewTable(review.comments);
  if (overview) parts.push(overview);

  const offDiff = formatOffDiffSection(offDiffComments);
  if (offDiff) parts.push(offDiff);

  return parts.join("\n\n");
}

export interface BuildReviewBodyOptions {
  offDiffComments?: OffDiffComment[];
  isRerun?: boolean;
  appPrUrl?: string;
}

export function buildReviewBody(
  review: ReviewResult,
  options: BuildReviewBodyOptions = {},
): string {
  const { offDiffComments = [], isRerun = false, appPrUrl } = options;
  const parts: string[] = [];

  const summaryLine = walkthroughSummaryLine(review);
  const walkthroughTitle = isRerun
    ? `<strong>AI Code Review</strong> (re-run) — ${summaryLine}`
    : `<strong>AI Code Review</strong> — ${summaryLine}`;

  const walkthrough = buildWalkthroughContent(review, offDiffComments);
  parts.push(
    `<details>\n<summary>${walkthroughTitle}</summary>\n\n${walkthrough}\n</details>`,
  );

  if (appPrUrl) {
    parts.push(`[View full review in dashboard](${appPrUrl})`);
  }

  parts.push(`---\n🤖 AI Code Review — risk **${review.riskScore}/100**`);

  return parts.join("\n\n");
}

export interface CommitStatusResult {
  state: "success" | "failure" | "pending" | "error";
  description: string;
}

export function statusFromReview(review: ReviewResult): CommitStatusResult {
  const counts = countBySeverity(review.comments);
  const issueCount = review.comments.length;
  const criticalHigh = counts.critical + counts.high;

  const shouldFail =
    counts.critical > 0 ||
    counts.high > 0 ||
    review.riskScore >= RISK_FAIL_THRESHOLD;

  if (shouldFail) {
    const parts: string[] = [`Risk ${review.riskScore}/100`];
    if (issueCount > 0) {
      parts.push(
        `${issueCount} issue${issueCount === 1 ? "" : "s"} (${criticalHigh} critical/high)`,
      );
    }
    return { state: "failure", description: parts.join(" · ") };
  }

  if (issueCount === 0) {
    return {
      state: "success",
      description: `Risk ${review.riskScore}/100 · No issues`,
    };
  }

  return {
    state: "success",
    description: `Risk ${review.riskScore}/100 · ${issueCount} minor finding${issueCount === 1 ? "" : "s"}`,
  };
}

export type CheckRunConclusion = "success" | "failure" | "neutral";

/** Maps review findings to GitHub Check Run conclusion. */
export function checkRunConclusionFromReview(
  review: ReviewResult,
): CheckRunConclusion {
  const counts = countBySeverity(review.comments);
  if (counts.critical > 0) {
    return "failure";
  }
  if (counts.high > 0 || review.riskScore >= RISK_FAIL_THRESHOLD) {
    return "neutral";
  }
  return "success";
}

export function checkRunOutputFromReview(review: ReviewResult): {
  title: string;
  summary: string;
} {
  const issueCount = review.comments.length;
  if (issueCount === 0) {
    return {
      title: "No issues found",
      summary: `${review.summary}\n\nRisk score: **${review.riskScore}/100**`,
    };
  }

  const counts = countBySeverity(review.comments);
  const parts = [
    review.summary,
    "",
    `**${issueCount}** finding(s) · risk **${review.riskScore}/100**`,
  ];
  if (counts.critical + counts.high > 0) {
    parts.push(
      `Critical/high: **${counts.critical + counts.high}** (P0: ${counts.critical}, P1: ${counts.high})`,
    );
  }

  return {
    title: `${issueCount} finding(s) — risk ${review.riskScore}/100`,
    summary: parts.join("\n"),
  };
}
