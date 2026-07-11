import { logger } from "../lib/logger.ts";
import { getInstallationOctokit } from "../services/github-app.ts";
import { embedDocuments } from "../services/voyage.ts";
import { buildChunksFromFiles } from "./chunk.ts";
import { replaceFileChunks } from "./chunk-store.ts";
import { fetchTypeScriptFiles, type RepoSourceFile } from "./github-files.ts";

export type EmbedIndexInput = {
  repositoryId: string;
  commitSha: string;
  installationId: number;
  owner: string;
  repo: string;
  headSha: string;
};

export type LocalEmbedIndexInput = {
  repositoryId: string;
  commitSha: string;
  files: RepoSourceFile[];
};

export type EmbedIndexResult = {
  filesProcessed: number;
  chunksBuilt: number;
  chunksWritten: number;
};

export async function indexEmbeddingsFromSources(
  input: LocalEmbedIndexInput,
): Promise<EmbedIndexResult> {
  const chunks = buildChunksFromFiles(input.files);

  if (chunks.length === 0) {
    logger.warn("embed-index: no chunks built", {
      repositoryId: input.repositoryId,
      files: input.files.length,
    });
    return {
      filesProcessed: input.files.length,
      chunksBuilt: 0,
      chunksWritten: 0,
    };
  }

  const embeddings = await embedDocuments(chunks.map((chunk) => chunk.embedText));
  const chunksWithEmbeddings = chunks.map((chunk, index) => ({
    ...chunk,
    embedding: embeddings[index]!,
  }));

  const chunksWritten = await replaceFileChunks(
    input.repositoryId,
    input.commitSha,
    chunksWithEmbeddings,
  );

  return {
    filesProcessed: input.files.length,
    chunksBuilt: chunks.length,
    chunksWritten,
  };
}

export async function indexEmbeddings(
  input: EmbedIndexInput,
): Promise<EmbedIndexResult> {
  const octokit = await getInstallationOctokit(input.installationId);
  const files = await fetchTypeScriptFiles(
    octokit,
    input.owner,
    input.repo,
    input.headSha,
  );

  logger.info("embed-index: fetched files", {
    repositoryId: input.repositoryId,
    owner: input.owner,
    repo: input.repo,
    headSha: input.headSha,
    fileCount: files.length,
  });

  if (files.length === 0) {
    throw new Error("No TypeScript files found to embed");
  }

  return indexEmbeddingsFromSources({
    repositoryId: input.repositoryId,
    commitSha: input.commitSha,
    files,
  });
}
