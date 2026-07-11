import { getInstallationOctokit } from "../services/github-app.ts";
import { logger } from "../lib/logger.ts";
import { fetchTypeScriptFiles, type RepoSourceFile } from "./github-files.ts";
import { parseFile } from "./parse.ts";
import {
  collectGraphFromParse,
  writeGraphToNeo4j,
  type GraphEdgeRow,
  type GraphNodeRow,
} from "./graph-write.ts";

export type GraphBuildInput = {
  repositoryId: string;
  installationId: number;
  owner: string;
  repo: string;
  headSha: string;
};

export type LocalGraphBuildInput = {
  repositoryId: string;
  files: RepoSourceFile[];
};

export type GraphBuildResult = {
  filesProcessed: number;
  nodesWritten: number;
  edgesWritten: number;
};

function mergeGraphParts(parts: GraphCollectPart[]): {
  nodes: GraphNodeRow[];
  edges: GraphEdgeRow[];
} {
  const nodeMap = new Map<string, GraphNodeRow>();
  const edgeKeys = new Set<string>();
  const edges: GraphEdgeRow[] = [];

  for (const part of parts) {
    for (const node of part.nodes) {
      nodeMap.set(node.id, node);
    }
    for (const edge of part.edges) {
      const key = `${edge.type}:${edge.fromId}:${edge.toId}`;
      if (edgeKeys.has(key)) {
        continue;
      }
      edgeKeys.add(key);
      edges.push(edge);
    }
  }

  return { nodes: [...nodeMap.values()], edges };
}

type GraphCollectPart = ReturnType<typeof collectGraphFromParse>;

function buildGraphFromFiles(
  repositoryId: string,
  files: RepoSourceFile[],
): { nodes: GraphNodeRow[]; edges: GraphEdgeRow[]; filesProcessed: number } {
  const parts: GraphCollectPart[] = [];

  for (const file of files) {
    try {
      const parsed = parseFile(file.path, file.content);
      parts.push(collectGraphFromParse(repositoryId, file.path, parsed));
    } catch (err) {
      logger.warn("graph-build: skip file", {
        path: file.path,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const merged = mergeGraphParts(parts);
  return {
    ...merged,
    filesProcessed: parts.length,
  };
}

export async function buildStructuralGraphFromSources(
  input: LocalGraphBuildInput,
): Promise<GraphBuildResult> {
  const graph = buildGraphFromFiles(input.repositoryId, input.files);
  const written = await writeGraphToNeo4j(graph.nodes, graph.edges);

  return {
    filesProcessed: graph.filesProcessed,
    nodesWritten: written.nodesWritten,
    edgesWritten: written.edgesWritten,
  };
}

export async function buildStructuralGraph(
  input: GraphBuildInput,
): Promise<GraphBuildResult> {
  const octokit = await getInstallationOctokit(input.installationId);
  const files = await fetchTypeScriptFiles(
    octokit,
    input.owner,
    input.repo,
    input.headSha,
  );

  logger.info("graph-build: fetched files", {
    repositoryId: input.repositoryId,
    owner: input.owner,
    repo: input.repo,
    headSha: input.headSha,
    fileCount: files.length,
  });

  if (files.length === 0) {
    throw new Error("No TypeScript files found to index");
  }

  return buildStructuralGraphFromSources({
    repositoryId: input.repositoryId,
    files,
  });
}
