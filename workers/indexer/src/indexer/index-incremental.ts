import { getInstallationOctokit } from "../services/github-app.ts";
import { logger } from "../lib/logger.ts";
import {
  fetchTypeScriptFiles,
  fetchTypeScriptFilesAtPaths,
  type RepoSourceFile,
} from "./github-files.ts";
import {
  listChangedTypeScriptPaths,
  type ChangedPathsPlan,
} from "./github-compare.ts";
import { buildStructuralGraphFromSources } from "./graph-build.ts";
import { indexEmbeddingsFromSources } from "./embed-index.ts";
import { purgeGraphForPaths, purgeGraphForRepository } from "./graph-purge.ts";
import {
  deleteFileChunksForPaths,
  replaceFileChunks,
  upsertFileChunks,
} from "./chunk-store.ts";
import { buildChunksFromFiles } from "./chunk.ts";
import { embedDocuments } from "../services/voyage.ts";

const DEFAULT_INCREMENTAL_MAX_FILES = 80;

export type IndexMode = "full" | "incremental";

export type IndexPlan = {
  mode: IndexMode;
  changed: ChangedPathsPlan;
  reason: string;
};

export type IndexRepoRunInput = {
  repositoryId: string;
  installationId: number;
  owner: string;
  repo: string;
  headSha: string;
  baseCommit?: string | null;
};

export type IndexRepoRunResult = {
  mode: IndexMode;
  reason: string;
  changedPaths: string[];
  removedPaths: string[];
  graph: Awaited<ReturnType<typeof buildStructuralGraphFromSources>>;
  embed: {
    filesProcessed: number;
    chunksBuilt: number;
    chunksWritten: number;
  };
};

function incrementalMaxFiles(): number {
  const parsed = Number(process.env.INDEX_INCREMENTAL_MAX_FILES?.trim());
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_INCREMENTAL_MAX_FILES;
}

export function chooseIndexPlan(
  changed: ChangedPathsPlan,
  totalComparableFiles?: number,
): IndexPlan {
  const touchedCount = changed.addedOrModified.length + changed.removed.length;

  if (touchedCount === 0) {
    return {
      mode: "full",
      changed,
      reason: "No comparable file changes detected; falling back to full index",
    };
  }

  if (changed.addedOrModified.length > incrementalMaxFiles()) {
    return {
      mode: "full",
      changed,
      reason: `Changed file count ${changed.addedOrModified.length} exceeds incremental threshold`,
    };
  }

  if (
    totalComparableFiles &&
    touchedCount / totalComparableFiles > 0.5
  ) {
    return {
      mode: "full",
      changed,
      reason: "More than half of indexed files changed; using full index",
    };
  }

  return {
    mode: "incremental",
    changed,
    reason: `Incremental index for ${touchedCount} changed path(s)`,
  };
}

export async function resolveIndexPlan(
  input: IndexRepoRunInput,
): Promise<IndexPlan> {
  if (!input.baseCommit || input.baseCommit === input.headSha) {
    return {
      mode: "full",
      changed: { addedOrModified: [], removed: [] },
      reason: "No baseCommit provided; using full index",
    };
  }

  const octokit = await getInstallationOctokit(input.installationId);
  const changed = await listChangedTypeScriptPaths(
    octokit,
    input.owner,
    input.repo,
    input.baseCommit,
    input.headSha,
  );

  return chooseIndexPlan(changed);
}

async function indexEmbeddingsIncremental(
  repositoryId: string,
  commitSha: string,
  files: RepoSourceFile[],
  removedPaths: string[],
): Promise<{
  filesProcessed: number;
  chunksBuilt: number;
  chunksWritten: number;
}> {
  const pathsToReplace = [
    ...removedPaths,
    ...files.map((file) => file.path),
  ];

  if (pathsToReplace.length > 0) {
    await deleteFileChunksForPaths(repositoryId, pathsToReplace);
  }

  if (files.length === 0) {
    return { filesProcessed: 0, chunksBuilt: 0, chunksWritten: 0 };
  }

  const chunks = buildChunksFromFiles(files);
  if (chunks.length === 0) {
    return { filesProcessed: files.length, chunksBuilt: 0, chunksWritten: 0 };
  }

  const embeddings = await embedDocuments(chunks.map((chunk) => chunk.embedText));
  const rows = chunks.map((chunk, index) => ({
    ...chunk,
    embedding: embeddings[index]!,
  }));

  await upsertFileChunks(repositoryId, commitSha, rows);

  return {
    filesProcessed: files.length,
    chunksBuilt: chunks.length,
    chunksWritten: rows.length,
  };
}

export async function runRepositoryIndex(
  input: IndexRepoRunInput,
  plan: IndexPlan,
): Promise<IndexRepoRunResult> {
  const octokit = await getInstallationOctokit(input.installationId);

  if (plan.mode === "full") {
    await purgeGraphForRepository(input.repositoryId);

    const files = await fetchTypeScriptFiles(
      octokit,
      input.owner,
      input.repo,
      input.headSha,
    );

    if (files.length === 0) {
      throw new Error("No TypeScript files found to index");
    }

    const graph = await buildStructuralGraphFromSources({
      repositoryId: input.repositoryId,
      files,
    });

    const embed = await indexEmbeddingsFromSources({
      repositoryId: input.repositoryId,
      commitSha: input.headSha,
      files,
    });

    return {
      mode: plan.mode,
      reason: plan.reason,
      changedPaths: files.map((file) => file.path),
      removedPaths: [],
      graph,
      embed,
    };
  }

  const pathsToPurge = [
    ...plan.changed.removed,
    ...plan.changed.addedOrModified,
  ];
  await purgeGraphForPaths(input.repositoryId, pathsToPurge);

  const files = await fetchTypeScriptFilesAtPaths(
    octokit,
    input.owner,
    input.repo,
    input.headSha,
    plan.changed.addedOrModified,
  );

  logger.info("index-incremental: fetched changed files", {
    repositoryId: input.repositoryId,
    requested: plan.changed.addedOrModified.length,
    fetched: files.length,
    removed: plan.changed.removed.length,
  });

  const graph =
    files.length > 0
      ? await buildStructuralGraphFromSources({
          repositoryId: input.repositoryId,
          files,
        })
      : {
          filesProcessed: 0,
          nodesWritten: 0,
          edgesWritten: 0,
          importEdges: 0,
          callEdges: 0,
        };

  const embed = await indexEmbeddingsIncremental(
    input.repositoryId,
    input.headSha,
    files,
    plan.changed.removed,
  );

  return {
    mode: plan.mode,
    reason: plan.reason,
    changedPaths: plan.changed.addedOrModified,
    removedPaths: plan.changed.removed,
    graph,
    embed,
  };
}
