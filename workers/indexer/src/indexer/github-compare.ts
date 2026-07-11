import type { Octokit } from "octokit";
import { shouldIndexPath } from "./github-files.ts";

export type CompareFileChange = {
  path: string;
  status: string;
  previousPath?: string;
};

export type ChangedPathsPlan = {
  addedOrModified: string[];
  removed: string[];
};

function normalizeCompareFile(file: {
  filename?: string;
  previous_filename?: string;
  status: string;
}): CompareFileChange | null {
  if (!file.filename) {
    return null;
  }

  return {
    path: file.filename,
    status: file.status,
    previousPath: file.previous_filename,
  };
}

export function planChangedPaths(files: CompareFileChange[]): ChangedPathsPlan {
  const addedOrModified = new Set<string>();
  const removed = new Set<string>();

  for (const file of files) {
    if (file.status === "removed") {
      removed.add(file.path);
      continue;
    }

    if (shouldIndexPath(file.path)) {
      addedOrModified.add(file.path);
    }

    if (file.status === "renamed" && file.previousPath && shouldIndexPath(file.previousPath)) {
      removed.add(file.previousPath);
    }
  }

  return {
    addedOrModified: [...addedOrModified],
    removed: [...removed],
  };
}

export async function listChangedTypeScriptPaths(
  octokit: Octokit,
  owner: string,
  repo: string,
  baseSha: string,
  headSha: string,
): Promise<ChangedPathsPlan> {
  const comparison = await octokit.rest.repos.compareCommits({
    owner,
    repo,
    base: baseSha,
    head: headSha,
  });

  const files = (comparison.data.files ?? [])
    .map(normalizeCompareFile)
    .filter((file): file is CompareFileChange => file !== null);

  return planChangedPaths(files);
}
