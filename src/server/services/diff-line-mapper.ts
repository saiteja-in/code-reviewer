import type { ReviewComment } from "@/server/services/ai";

export interface FileWithPatch {
  filename: string;
  patch?: string;
}

export interface GitHubInlineComment {
  path: string;
  line: number;
  side: "RIGHT" | "LEFT";
  body: string;
}

export interface OffDiffComment extends ReviewComment {
  reason: "file_not_in_pr" | "line_not_in_diff";
}

interface HunkState {
  newStart: number;
  newLine: number;
}

/**
 * Parse a unified diff patch and return RIGHT-side file line numbers that
 * GitHub accepts for inline review comments (added lines and context lines).
 */
export function getCommentableLines(patch: string): Set<number> {
  const lines = new Set<number>();
  let hunk: HunkState | null = null;

  for (const raw of patch.split("\n")) {
    if (raw.startsWith("@@")) {
      const match = raw.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        hunk = { newStart: Number(match[1]), newLine: Number(match[1]) };
      }
      continue;
    }

    if (!hunk) continue;

    if (raw.startsWith("+")) {
      lines.add(hunk.newLine);
      hunk.newLine++;
    } else if (raw.startsWith("-")) {
      // Deletions don't advance the new-file line counter.
    } else if (raw.startsWith("\\")) {
      // "\ No newline at end of file" — ignore.
    } else {
      // Context line (unchanged in the new file).
      lines.add(hunk.newLine);
      hunk.newLine++;
    }
  }

  return lines;
}

export function buildCommentableLineIndex(
  files: FileWithPatch[],
): Map<string, Set<number>> {
  const index = new Map<string, Set<number>>();

  for (const file of files) {
    if (!file.patch) continue;
    index.set(file.filename, getCommentableLines(file.patch));
  }

  return index;
}

export function mapInlineComments(
  comments: ReviewComment[],
  files: FileWithPatch[],
  buildBody: (comment: ReviewComment) => string,
): { inline: GitHubInlineComment[]; offDiff: OffDiffComment[] } {
  const index = buildCommentableLineIndex(files);
  const inline: GitHubInlineComment[] = [];
  const offDiff: OffDiffComment[] = [];

  for (const comment of comments) {
    const fileLines = index.get(comment.file);
    if (!fileLines) {
      offDiff.push({ ...comment, reason: "file_not_in_pr" });
      continue;
    }

    if (!fileLines.has(comment.line)) {
      offDiff.push({ ...comment, reason: "line_not_in_diff" });
      continue;
    }

    inline.push({
      path: comment.file,
      line: comment.line,
      side: "RIGHT",
      body: buildBody(comment),
    });
  }

  return { inline, offDiff };
}
