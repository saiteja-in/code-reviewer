import type { RepoContextSnippet } from "@/server/services/ai";

export type PullRequestFileInput = {
  filename: string;
  status: string;
  patch?: string;
};

type ContextRole = RepoContextSnippet["role"];

export type ContextCandidate = {
  path: string;
  startLine: number;
  endLine: number;
  name: string;
  role: ContextRole;
  priority: number;
  source?: string;
};

const DEFAULT_MAX_SNIPPETS = 12;
const DEFAULT_MAX_SNIPPET_CHARS = 2000;
const DEFAULT_TOTAL_CHAR_BUDGET = 24_000;

function maxSnippets(): number {
  const parsed = Number(process.env.CONTEXT_MAX_SNIPPETS?.trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_SNIPPETS;
}

function maxSnippetChars(): number {
  const parsed = Number(process.env.CONTEXT_MAX_SNIPPET_CHARS?.trim());
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_MAX_SNIPPET_CHARS;
}

function totalCharBudget(): number {
  const parsed = Number(process.env.CONTEXT_TOTAL_CHAR_BUDGET?.trim());
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_TOTAL_CHAR_BUDGET;
}

export function extractChangedPaths(files: PullRequestFileInput[]): string[] {
  const paths = new Set<string>();

  for (const file of files) {
    if (file.status === "removed") {
      continue;
    }
    paths.add(file.filename);
  }

  return [...paths];
}

export function buildRetrievalQuery(
  prTitle: string,
  files: PullRequestFileInput[],
): string {
  const changedPaths = extractChangedPaths(files);
  const patchExcerpt = files
    .filter((file) => file.patch)
    .slice(0, 5)
    .map((file) => `File: ${file.filename}\n${file.patch!.slice(0, 1200)}`)
    .join("\n\n");

  return [
    `Pull request: ${prTitle}`,
    `Changed files: ${changedPaths.join(", ")}`,
    patchExcerpt,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function candidateKey(candidate: ContextCandidate): string {
  return `${candidate.path}:${candidate.startLine}-${candidate.endLine}:${candidate.role}`;
}

function trimSnippetText(text: string, limit: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= limit) {
    return trimmed;
  }
  return `${trimmed.slice(0, limit - 1)}…`;
}

export function applyContextBudget(
  candidates: ContextCandidate[],
): { snippets: RepoContextSnippet[]; dropped: string[] } {
  const sorted = [...candidates].sort((a, b) => b.priority - a.priority);
  const seen = new Set<string>();
  const snippets: RepoContextSnippet[] = [];
  const dropped: string[] = [];
  const snippetLimit = maxSnippets();
  const snippetChars = maxSnippetChars();
  let totalChars = 0;

  for (const candidate of sorted) {
    const key = candidateKey(candidate);
    if (seen.has(key)) {
      continue;
    }

    const source = trimSnippetText(candidate.source ?? "", snippetChars);
    if (!source) {
      dropped.push(`${candidate.path}:${candidate.startLine} (empty source)`);
      continue;
    }

    if (snippets.length >= snippetLimit) {
      dropped.push(`${candidate.path}:${candidate.startLine} (snippet limit)`);
      continue;
    }

    if (totalChars + source.length > totalCharBudget()) {
      dropped.push(`${candidate.path}:${candidate.startLine} (char budget)`);
      continue;
    }

    seen.add(key);
    totalChars += source.length;
    snippets.push({
      path: candidate.path,
      startLine: candidate.startLine,
      endLine: candidate.endLine,
      name: candidate.name,
      role: candidate.role,
      source,
    });
  }

  return { snippets, dropped };
}
