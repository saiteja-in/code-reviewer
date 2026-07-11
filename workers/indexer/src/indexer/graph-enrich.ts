import { logger } from "../lib/logger.ts";
import {
  buildImportEdges,
  resolveCallEdges,
  type FileParseBundle,
} from "./call-resolver.ts";
import { collectImportsForFiles } from "./imports.ts";
import { parseFile } from "./parse.ts";
import type { RepoSourceFile } from "./github-files.ts";
import type { GraphEdgeRow } from "./graph-write.ts";

export type GraphEnrichStats = {
  importEdges: number;
  callEdges: number;
};

export function enrichGraphFromSources(
  repositoryId: string,
  files: RepoSourceFile[],
): { edges: GraphEdgeRow[]; stats: GraphEnrichStats } {
  const bundles: FileParseBundle[] = files.map((file) => ({
    path: file.path,
    parseResult: parseFile(file.path, file.content),
  }));

  const imports = collectImportsForFiles(files);
  const importEdges = buildImportEdges(repositoryId, imports);
  const callEdges = resolveCallEdges(repositoryId, bundles, imports);

  logger.info("graph-enrich: resolved edges", {
    repositoryId,
    importEdges: importEdges.length,
    callEdges: callEdges.length,
    files: files.length,
  });

  return {
    edges: [...importEdges, ...callEdges],
    stats: {
      importEdges: importEdges.length,
      callEdges: callEdges.length,
    },
  };
}
