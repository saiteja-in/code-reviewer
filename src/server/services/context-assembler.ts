import { db } from "@/server/db";
import type { RepoContext } from "@/server/services/ai";
import {
  applyContextBudget,
  buildRetrievalQuery,
  extractChangedPaths,
  type ContextCandidate,
  type PullRequestFileInput,
} from "@/server/services/context-assembler-budget";
import {
  extractFileLines,
  fetchRepositoryFileContent,
} from "@/server/services/github";
import { isNeo4jConfigured, runRead } from "@/server/services/neo4j";
import { embedQuery, isVoyageConfigured } from "@/server/services/voyage";

export type { PullRequestFileInput } from "@/server/services/context-assembler-budget";

export type AssembleContextInput = {
  repositoryId: string;
  owner: string;
  repo: string;
  headSha: string;
  accessToken: string;
  prTitle: string;
  files: PullRequestFileInput[];
  indexedCommit?: string | null;
};

type GraphCandidateRow = {
  path: string;
  name: string;
  startLine: number | { toNumber?: () => number };
  endLine: number | { toNumber?: () => number };
  role: string;
  confidence?: string | null;
};

type ChunkHitRow = {
  path: string;
  symbol: string | null;
  startLine: number;
  endLine: number;
  content: string;
  score: number | string;
};

function toNumber(value: number | { toNumber?: () => number }): number {
  if (typeof value === "number") {
    return value;
  }
  if (value && typeof value.toNumber === "function") {
    return value.toNumber();
  }
  return Number(value);
}

function maxSnippetsFromEnv(): number {
  const parsed = Number(process.env.CONTEXT_MAX_SNIPPETS?.trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 12;
}

async function findGraphCandidates(
  repositoryId: string,
  changedPaths: string[],
): Promise<ContextCandidate[]> {
  if (!isNeo4jConfigured() || changedPaths.length === 0) {
    return [];
  }

  const impacted = await runRead<GraphCandidateRow>(
    `
      MATCH (caller:Method {repoId: $repoId})-[edge:CALLS]->(callee:Method {repoId: $repoId})
      WHERE callee.path IN $changedPaths
      RETURN DISTINCT
        caller.path AS path,
        caller.qualifiedName AS name,
        caller.startLine AS startLine,
        caller.endLine AS endLine,
        'impacted' AS role,
        edge.confidence AS confidence
      LIMIT 20
    `,
    { repoId: repositoryId, changedPaths },
  );

  const definitions = await runRead<GraphCandidateRow>(
    `
      MATCH (caller:Method {repoId: $repoId})-[edge:CALLS]->(callee:Method {repoId: $repoId})
      WHERE caller.path IN $changedPaths AND NOT callee.path IN $changedPaths
      RETURN DISTINCT
        callee.path AS path,
        callee.qualifiedName AS name,
        callee.startLine AS startLine,
        callee.endLine AS endLine,
        'definition' AS role,
        edge.confidence AS confidence
      LIMIT 20
    `,
    { repoId: repositoryId, changedPaths },
  );

  return [...impacted, ...definitions].map((row) => {
    const role = row.role === "definition" ? "definition" : "impacted";
    const confidenceBoost =
      row.confidence === "high" ? 10 : row.confidence === "medium" ? 5 : 0;
    const basePriority = role === "impacted" ? 100 : 80;

    return {
      path: row.path,
      name: row.name,
      startLine: toNumber(row.startLine),
      endLine: toNumber(row.endLine),
      role,
      priority: basePriority + confidenceBoost,
    };
  });
}

async function findSimilarChunks(
  repositoryId: string,
  query: string,
  changedPaths: Set<string>,
): Promise<ContextCandidate[]> {
  if (!isVoyageConfigured()) {
    return [];
  }

  const queryVector = await embedQuery(query);
  const vectorLiteral = `[${queryVector.join(",")}]`;
  const limit = maxSnippetsFromEnv();

  const rows = await db.$queryRawUnsafe<ChunkHitRow[]>(
    `SELECT path, symbol, "startLine", "endLine", content,
            1 - (embedding <=> $1::vector) AS score
     FROM "FileChunk"
     WHERE "repositoryId" = $2
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    vectorLiteral,
    repositoryId,
    limit,
  );

  return rows
    .filter((row) => !changedPaths.has(row.path))
    .map((row) => ({
      path: row.path,
      startLine: row.startLine,
      endLine: row.endLine,
      name: row.symbol ?? row.path.split("/").pop() ?? row.path,
      role: "related" as const,
      priority: 50 + Math.round(Number(row.score) * 40),
      source: row.content,
    }));
}

async function hydrateCandidateSources(
  candidates: ContextCandidate[],
  input: AssembleContextInput,
): Promise<ContextCandidate[]> {
  const fileCache = new Map<string, string>();
  const hydrated: ContextCandidate[] = [];

  for (const candidate of candidates) {
    if (candidate.source) {
      hydrated.push(candidate);
      continue;
    }

    let fileContent = fileCache.get(candidate.path);
    if (fileContent === undefined) {
      fileContent =
        (await fetchRepositoryFileContent(
          input.accessToken,
          input.owner,
          input.repo,
          candidate.path,
          input.headSha,
        )) ?? "";
      fileCache.set(candidate.path, fileContent);
    }

    if (!fileContent) {
      continue;
    }

    hydrated.push({
      ...candidate,
      source: extractFileLines(fileContent, candidate.startLine, candidate.endLine),
    });
  }

  return hydrated;
}

export async function assembleRepoContext(
  input: AssembleContextInput,
): Promise<RepoContext> {
  const changedPaths = extractChangedPaths(input.files);
  const changedPathSet = new Set(changedPaths);

  if (changedPaths.length === 0) {
    return { snippets: [], dropped: ["No changed files in pull request"] };
  }

  const [graphCandidates, vectorCandidates] = await Promise.all([
    findGraphCandidates(input.repositoryId, changedPaths),
    findSimilarChunks(
      input.repositoryId,
      buildRetrievalQuery(input.prTitle, input.files),
      changedPathSet,
    ),
  ]);

  const merged = [...graphCandidates, ...vectorCandidates].filter(
    (candidate) => !changedPathSet.has(candidate.path),
  );

  const hydrated = await hydrateCandidateSources(merged, input);
  const { snippets, dropped } = applyContextBudget(hydrated);

  if (
    input.indexedCommit &&
    input.indexedCommit !== input.headSha &&
    snippets.length > 0
  ) {
    dropped.push(
      `Index commit ${input.indexedCommit.slice(0, 7)} differs from PR head ${input.headSha.slice(0, 7)}; graph hits may be stale (sources fetched at PR head).`,
    );
  }

  return {
    snippets,
    dropped: dropped.length > 0 ? dropped : undefined,
  };
}
