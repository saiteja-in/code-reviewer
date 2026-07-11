import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { ReviewMode } from "@/server/services/review-mode";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  return (client ??= new Anthropic());
}

export const ReviewCommentSchema = z.object({
  file: z.string(),
  line: z.number(),
  severity: z.enum(["critical", "high", "medium", "low"]),
  category: z.enum(["bug", "security", "performance", "style", "suggestion"]),
  title: z.string().optional(),
  message: z.string(),
  impact: z.string().optional(),
  suggestion: z.string().optional(),
});

export const ReviewResultSchema = z.object({
  summary: z.string(),
  riskScore: z.number().min(0).max(100),
  comments: z.array(ReviewCommentSchema),
});

export type ReviewComment = z.infer<typeof ReviewCommentSchema>;
export type ReviewResult = z.infer<typeof ReviewResultSchema>;

/** Code from outside the PR diff (callers, definitions, semantic neighbors). */
export interface RepoContextSnippet {
  path: string;
  startLine: number;
  endLine: number;
  name: string;
  role: "impacted" | "definition" | "related";
  source: string;
}

export interface RepoContext {
  snippets: RepoContextSnippet[];
  dropped?: string[];
}

interface FileChange {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

export interface ReviewCodeOptions {
  mode?: ReviewMode;
  repoContext?: RepoContext;
}

const DIFF_SYSTEM_PROMPT = `You are an expert code reviewer. Analyze the provided pull request diff and provide a structured review.

Your review should:
1. Identify bugs, security issues, performance problems, and code style issues
2. Provide a brief summary of the changes and overall assessment
3. Assign a risk score (0-100) based on the complexity and potential issues
4. Give specific, actionable feedback referencing exact file paths and line numbers from the diff

Line numbers must be the **new-file line number** (RIGHT side) as shown in the diff hunk headers (e.g. after @@ -old +NEW @@). Only reference lines that appear in the changed hunks.

Severity guide:
- critical (P0): Security vulnerabilities, data loss, crashes — must fix before merge
- high (P1): Bugs that will cause issues in production — should fix
- medium (P2): Should be fixed but won't break things
- low (P3): Style issues, minor improvements

For each comment:
- title: Short scannable headline (max ~80 chars) — what is wrong, not how to fix
- message: Detailed explanation with specifics from the diff
- impact: One sentence on consequence or risk; omit for trivial style nits
- suggestion: ONLY literal code that replaces the line at file:line for a one-click GitHub fix. No prose, no markdown fences inside. Omit if the fix is architectural, spans multiple hunks, or you are unsure of the exact replacement text.

Be concise but specific.`;

const GRAPH_SYSTEM_EXTRA = `

When repository context is provided (code outside the diff), use it to find breaking changes and cross-file impact.
- Report issues in files outside the diff when the change breaks callers or contracts.
- Cite external impact explicitly in the impact field (path:line).`;

function formatRepoContextSection(context: RepoContext): string {
  const blocks = context.snippets.map((s) => {
    const header = `### ${s.path}:${s.startLine}-${s.endLine} (${s.role}) — ${s.name}`;
    return `${header}\n\`\`\`\n${s.source}\n\`\`\``;
  });

  const parts = [
    "## Relevant code from the rest of the repository",
    ...blocks,
  ];

  if (context.dropped?.length) {
    parts.push(
      `_Omitted ${context.dropped.length} snippet(s) due to token budget._`,
    );
  }

  return parts.join("\n\n");
}

export function buildReviewUserPrompt(
  prTitle: string,
  diffContent: string,
  options: ReviewCodeOptions = {},
): string {
  const mode = options.mode ?? "diff";
  const parts = [
    "Review this pull request:",
    "",
    `**Title:** ${prTitle}`,
    "",
    "**Changed code (diff):**",
    diffContent,
  ];

  if (mode === "graph" && options.repoContext?.snippets.length) {
    parts.push("", formatRepoContextSection(options.repoContext));
    parts.push(
      "",
      "Rules:",
      "- When a change breaks code OUTSIDE the diff, cite it in impact (path:line).",
      "- Prefer findings backed by the diff or provided repository context.",
    );
  }

  return parts.join("\n");
}

function reviewModel(): string {
  return process.env.REVIEW_MODEL?.trim() || "claude-sonnet-4-6";
}

function systemPrompt(options: ReviewCodeOptions): string {
  const mode = options.mode ?? "diff";
  if (mode === "graph" && options.repoContext?.snippets.length) {
    return DIFF_SYSTEM_PROMPT + GRAPH_SYSTEM_EXTRA;
  }
  return DIFF_SYSTEM_PROMPT;
}

export async function reviewCode(
  prTitle: string,
  files: FileChange[],
  options: ReviewCodeOptions = {},
): Promise<ReviewResult> {
  const diffContent = files
    .filter((f) => f.patch)
    .map(
      (f) => `### ${f.filename} (${f.status})\n\`\`\`diff\n${f.patch}\n\`\`\``,
    )
    .join("\n\n");

  if (!diffContent.trim()) {
    return {
      summary: "No code changes to review (binary files or empty diff).",
      riskScore: 0,
      comments: [],
    };
  }

  const userPrompt = buildReviewUserPrompt(prTitle, diffContent, options);

  const response = await getClient().messages.parse({
    model: reviewModel(),
    max_tokens: 4096,
    system: systemPrompt(options),
    messages: [{ role: "user", content: userPrompt }],
    output_config: { format: zodOutputFormat(ReviewResultSchema) },
  });

  const result = response.parsed_output;
  if (!result) {
    throw new Error("No structured review returned from Claude");
  }

  return result;
}
