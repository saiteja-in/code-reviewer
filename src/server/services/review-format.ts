import type { ReviewComment, ReviewResult } from "@/server/services/ai";
import type { OffDiffComment } from "@/server/services/diff-line-mapper";

export const RISK_FAIL_THRESHOLD = 75;

const SEVERITY_ORDER = ["critical", "high", "medium", "low"] as const;

export function buildInlineCommentBody(comment: ReviewComment): string {
  const severityLabel = comment.severity.toUpperCase();
  const categoryLabel = comment.category ? ` · ${comment.category}` : "";
  let body = `**${severityLabel}${categoryLabel}**\n\n${comment.message}`;

  if (comment.suggestion) {
    body += `\n\n**Suggestion:**\n\`\`\`\n${comment.suggestion}\n\`\`\``;
  }

  return body;
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

function verdictFromReview(review: ReviewResult): string {
  const counts = countBySeverity(review.comments);
  if (counts.critical > 0) {
    return `⚠️ **${counts.critical} critical** issue(s) found — address before merge.`;
  }
  if (counts.high > 0) {
    return `⚠️ **${counts.high} high** severity issue(s) found.`;
  }
  if (review.riskScore >= RISK_FAIL_THRESHOLD) {
    return `⚠️ Risk score **${review.riskScore}/100** exceeds threshold (${RISK_FAIL_THRESHOLD}).`;
  }
  if (review.comments.length === 0) {
    return "✅ No issues found.";
  }
  return `✅ Review complete — ${review.comments.length} finding(s), risk **${review.riskScore}/100**.`;
}

function severityTable(comments: ReviewComment[]): string {
  const counts = countBySeverity(comments);
  const rows = SEVERITY_ORDER.filter((s) => counts[s] > 0).map(
    (s) => `| ${s} | ${counts[s]} |`,
  );

  if (rows.length === 0) return "";

  return `### Findings by severity\n\n| Severity | Count |\n| --- | --- |\n${rows.join("\n")}`;
}

function formatOffDiffSection(offDiff: OffDiffComment[]): string {
  if (offDiff.length === 0) return "";

  const lines = offDiff.map((c) => {
    const reason =
      c.reason === "file_not_in_pr"
        ? "file not in PR"
        : "line not in diff";
    let text = `- **\`${c.file}:${c.line}\`** (${c.severity}) — ${c.message} _(${reason})_`;
    if (c.suggestion) {
      text += `\n  - Suggestion: \`${c.suggestion}\``;
    }
    return text;
  });

  return `### Additional findings (not posted inline)\n\n${lines.join("\n")}`;
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

  if (isRerun) {
    parts.push(
      `## AI Code Review (re-run @ ${new Date().toISOString()})`,
    );
  } else {
    parts.push("## AI Code Review");
  }

  parts.push(verdictFromReview(review));
  parts.push(`### Summary\n\n${review.summary}`);

  const table = severityTable(review.comments);
  if (table) parts.push(table);

  const offDiff = formatOffDiffSection(offDiffComments);
  if (offDiff) parts.push(offDiff);

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
