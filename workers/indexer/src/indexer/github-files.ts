import type { Octokit } from "octokit";

const MAX_FILE_BYTES = 1024 * 1024;
const MAX_FILES = 500;

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  ".git",
  "coverage",
  ".next",
  "out",
  "vendor",
  ".pnpm",
]);

export type RepoSourceFile = {
  path: string;
  content: string;
};

export function shouldIndexPath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  const lower = normalized.toLowerCase();

  if (!lower.endsWith(".ts") && !lower.endsWith(".tsx")) {
    return false;
  }
  if (lower.endsWith(".d.ts")) {
    return false;
  }

  const parts = lower.split("/");
  return !parts.some((part) => SKIP_DIRS.has(part));
}

function decodeContent(content: string, encoding: string): string {
  if (encoding === "base64") {
    return Buffer.from(content, "base64").toString("utf8");
  }
  return content;
}

export async function fetchTypeScriptFiles(
  octokit: Octokit,
  owner: string,
  repo: string,
  ref: string,
): Promise<RepoSourceFile[]> {
  const treeResponse = await octokit.rest.git.getTree({
    owner,
    repo,
    tree_sha: ref,
    recursive: "true",
  });

  const blobPaths = treeResponse.data.tree
    .filter(
      (entry): entry is { path: string; type: "blob"; size?: number } =>
        entry.type === "blob" &&
        typeof entry.path === "string" &&
        shouldIndexPath(entry.path) &&
        (entry.size ?? 0) <= MAX_FILE_BYTES,
    )
    .map((entry) => entry.path)
    .slice(0, MAX_FILES);

  const files: RepoSourceFile[] = [];

  for (const path of blobPaths) {
    try {
      const response = await octokit.rest.repos.getContent({
        owner,
        repo,
        path,
        ref,
      });

      if (Array.isArray(response.data) || response.data.type !== "file") {
        continue;
      }

      if (!response.data.content) {
        continue;
      }

      const raw = decodeContent(response.data.content, response.data.encoding);

      if (Buffer.byteLength(raw, "utf8") > MAX_FILE_BYTES) {
        continue;
      }

      files.push({ path, content: raw });
    } catch {
      // Skip unreadable paths (symlinks, LFS, permissions).
    }
  }

  return files;
}
