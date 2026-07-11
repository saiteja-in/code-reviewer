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
  /** Neo4j CALLS edge confidence when role is impacted or definition. */
  confidence?: "high" | "medium" | "low" | null;
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

const SHARED_SEVERITY_AND_OUTPUT = `Severity guide:
- critical (P0): Security vulnerabilities, data loss, crashes — must fix before merge
- high (P1): Bugs that will cause issues in production — should fix
- medium (P2): Should be fixed but won't break things
- low (P3): Style issues, minor improvements

For each comment:
- title: Short scannable headline (max ~80 chars) — what is wrong, not how to fix
- message: Detailed explanation with specifics from the diff and any cited context
- impact: One sentence on consequence or risk; omit for trivial style nits
- suggestion: ONLY literal code that replaces the line at file:line for a one-click GitHub fix. No prose, no markdown fences inside. Omit if the fix is architectural, spans multiple hunks, or you are unsure of the exact replacement text.

Be concise but specific.`;

const DIFF_SYSTEM_PROMPT = `You are an expert code reviewer. Analyze the provided pull request diff and provide a structured review.

Your review should:
1. Identify bugs, security issues, performance problems, and code style issues
2. Provide a brief summary of the changes and overall assessment
3. Assign a risk score (0-100) based on the complexity and potential issues
4. Give specific, actionable feedback referencing exact file paths and line numbers from the diff

Line numbers must be the **new-file line number** (RIGHT side) as shown in the diff hunk headers (e.g. after @@ -old +NEW @@). Only reference lines that appear in the changed hunks.

${SHARED_SEVERITY_AND_OUTPUT}`;

const GRAPH_SYSTEM_PROMPT = `You are an expert code reviewer with access to repository context beyond the pull request diff. Your job is to catch cross-file bugs and breaking changes that diff-only review misses.

You receive two inputs:
1. **Changed code (diff)** — what this PR modifies
2. **Repository context** — callers, callees, and related code outside the diff

## Review workflow

1. In the diff, identify changed public APIs: exports, function/method signatures, return types, parameters, class interfaces, thrown errors, and behavior.
2. For each changed API, inspect **impacted** context snippets first — these call into changed code. Check for type errors, wrong arity, broken assumptions, and runtime failures.
3. Inspect **definition** snippets — code the diff calls. Verify the diff uses those contracts correctly after the change.
4. Use **related** snippets only to corroborate or refine findings; do not treat them as proven call relationships.
5. Prefer findings grounded in the diff and provided context. Do not invent files, symbols, or call paths not shown.

## Breaking changes to prioritize

- Return type or parameter type changes
- Added/removed/reordered parameters
- Renamed or removed exports, methods, or types
- Stricter validation, nullability, or error handling
- Async/sync or side-effect behavior changes

## Output rules (GitHub inline comments)

- **Inline comments** (file + line): ONLY on lines present in the diff hunks (new-file line numbers from hunk headers).
- **Cross-file breakage**: the inline comment goes on the breaking change in the diff; describe affected external code in **impact** as \`path:line — consequence\`.
- When a diff change breaks callers shown in **impacted** context, severity is at least **high** and category is usually **bug**.
- Raise **riskScore** when a changed public API has impacted callers or clear contract breakage.

${SHARED_SEVERITY_AND_OUTPUT}`;

const GRAPH_USER_RULES = `Graph-mode rules:
- Check **impacted** snippets before **related** ones — callers of changed code matter most.
- When the diff breaks code outside the diff, cite the external location in **impact** (\`path:line — …\`).
- Keep inline comment \`file\`/\`line\` on diff lines only; external files belong in **impact**, not inline comments.
- Do not report issues unless supported by the diff, repository context, or both.`;

function formatSnippetHeader(snippet: RepoContextSnippet): string {
  const roleLabel =
    snippet.confidence && snippet.role !== "related"
      ? `${snippet.role}, CALLS confidence=${snippet.confidence}`
      : snippet.role;
  return `### ${snippet.path}:${snippet.startLine}-${snippet.endLine} (${roleLabel}) — ${snippet.name}`;
}

function formatRepoContextSection(context: RepoContext): string {
  const legend = [
    "Snippet roles:",
    "- **impacted** — calls into code changed by this PR (check these first for breakage)",
    "- **definition** — code called from the diff (verify the diff still satisfies the contract)",
    "- **related** — semantically similar code from search (supporting evidence only)",
    "",
    "CALLS confidence (impacted/definition only): high = same-class or import-resolved; medium/low = heuristic name match.",
  ].join("\n");

  const blocks = context.snippets.map((s) => {
    return `${formatSnippetHeader(s)}\n\`\`\`\n${s.source}\n\`\`\``;
  });

  const parts = [
    "## Repository context (outside this PR)",
    legend,
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
    parts.push("", GRAPH_USER_RULES);
  }

  return parts.join("\n");
}

export function buildReviewSystemPrompt(
  options: ReviewCodeOptions = {},
): string {
  const mode = options.mode ?? "diff";
  if (mode === "graph" && options.repoContext?.snippets.length) {
    return GRAPH_SYSTEM_PROMPT;
  }
  return DIFF_SYSTEM_PROMPT;
}

function systemPrompt(options: ReviewCodeOptions): string {
  return buildReviewSystemPrompt(options);
}

function reviewModel(): string {
  return process.env.REVIEW_MODEL?.trim() || "claude-sonnet-4-6";
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
