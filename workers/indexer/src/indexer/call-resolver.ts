import { fileNodeId, symbolNodeId } from "./graph-ids.ts";
import type { ParsedImport } from "./imports.ts";
import type { ParsedReference, ParsedSymbol } from "./types.ts";
import type { GraphEdgeRow } from "./graph-write.ts";

export type CallConfidence = "high" | "medium" | "low";

export type ResolvedCallEdge = GraphEdgeRow & {
  type: "CALLS";
  line: number;
  confidence: CallConfidence;
};

export type SymbolIndex = {
  byPath: Map<string, ParsedSymbol[]>;
  byQualifiedName: Map<string, ParsedSymbol[]>;
  byPathAndName: Map<string, ParsedSymbol[]>;
};

export type FileParseBundle = {
  path: string;
  parseResult: { nodes: ParsedSymbol[]; refs: ParsedReference[] };
};

function pathNameKey(path: string, name: string): string {
  return `${path}::${name}`;
}

export function buildSymbolIndex(bundles: FileParseBundle[]): SymbolIndex {
  const byPath = new Map<string, ParsedSymbol[]>();
  const byQualifiedName = new Map<string, ParsedSymbol[]>();
  const byPathAndName = new Map<string, ParsedSymbol[]>();

  for (const bundle of bundles) {
    byPath.set(bundle.path, bundle.parseResult.nodes);

    for (const symbol of bundle.parseResult.nodes) {
      const qBucket = byQualifiedName.get(symbol.qualifiedName) ?? [];
      qBucket.push(symbol);
      byQualifiedName.set(symbol.qualifiedName, qBucket);

      const pnKey = pathNameKey(symbol.path, symbol.name);
      const pnBucket = byPathAndName.get(pnKey) ?? [];
      pnBucket.push(symbol);
      byPathAndName.set(pnKey, pnBucket);
    }
  }

  return { byPath, byQualifiedName, byPathAndName };
}

function findSymbolAtLine(
  symbols: ParsedSymbol[],
  line: number,
): ParsedSymbol | null {
  let best: ParsedSymbol | null = null;

  for (const symbol of symbols) {
    if (line >= symbol.startLine && line <= symbol.endLine) {
      if (!best || symbol.startLine >= best.startLine) {
        best = symbol;
      }
    }
  }

  return best;
}

function findCallerSymbol(
  index: SymbolIndex,
  path: string,
  line: number,
): ParsedSymbol | null {
  const symbols = index.byPath.get(path) ?? [];
  const atLine = findSymbolAtLine(symbols, line);
  if (atLine && atLine.kind === "Method") {
    return atLine;
  }

  return atLine;
}

function classPrefixForCaller(caller: ParsedSymbol): string | null {
  if (!caller.qualifiedName.includes(".")) {
    return null;
  }
  return caller.qualifiedName.split(".").slice(0, -1).join(".");
}

function resolveInSameFile(
  index: SymbolIndex,
  path: string,
  ref: ParsedReference,
  caller: ParsedSymbol,
): ParsedSymbol | null {
  const classPrefix = classPrefixForCaller(caller);
  if (classPrefix) {
    const qualified = `${classPrefix}.${ref.name}`;
    const match = (index.byQualifiedName.get(qualified) ?? []).find(
      (s) => s.path === path,
    );
    if (match) {
      return match;
    }
  }

  const sameFile = (index.byPathAndName.get(pathNameKey(path, ref.name)) ?? []).filter(
    (s) => s.kind === "Method" || s.kind === "Class",
  );
  if (sameFile.length === 1) {
    return sameFile[0]!;
  }

  return null;
}

function resolveViaImports(
  index: SymbolIndex,
  imports: ParsedImport[],
  path: string,
  ref: ParsedReference,
): { symbol: ParsedSymbol; confidence: CallConfidence } | null {
  const fileImports = imports.filter((i) => i.path === path && i.resolvedPath);

  for (const imp of fileImports) {
    const targetPath = imp.resolvedPath!;

    for (const binding of imp.bindings) {
      if (binding.localName !== ref.name) {
        continue;
      }

      const importedName =
        binding.importedName === "default"
          ? binding.localName
          : binding.importedName;

      const byName = (index.byPathAndName.get(pathNameKey(targetPath, importedName)) ?? []).filter(
        (s) => s.path === targetPath,
      );
      if (byName.length === 1) {
        return { symbol: byName[0]!, confidence: "high" };
      }
    }

    const methodsNamed = (index.byPathAndName.get(pathNameKey(targetPath, ref.name)) ?? []).filter(
      (s) => s.path === targetPath && s.kind === "Method",
    );
    if (methodsNamed.length === 1) {
      return { symbol: methodsNamed[0]!, confidence: "medium" };
    }
    if (methodsNamed.length > 1) {
      return { symbol: methodsNamed[0]!, confidence: "low" };
    }

    const classNamed = (index.byPathAndName.get(pathNameKey(targetPath, ref.name)) ?? []).filter(
      (s) => s.path === targetPath && s.kind === "Class",
    );
    if (classNamed.length === 1) {
      return { symbol: classNamed[0]!, confidence: "medium" };
    }
  }

  return null;
}

function resolveCallee(
  index: SymbolIndex,
  imports: ParsedImport[],
  path: string,
  ref: ParsedReference,
  caller: ParsedSymbol,
): { symbol: ParsedSymbol; confidence: CallConfidence } | null {
  const sameFile = resolveInSameFile(index, path, ref, caller);
  if (sameFile) {
    return { symbol: sameFile, confidence: "high" };
  }

  return resolveViaImports(index, imports, path, ref);
}

export function buildImportEdges(
  repoId: string,
  imports: ParsedImport[],
): GraphEdgeRow[] {
  const edges: GraphEdgeRow[] = [];
  const seen = new Set<string>();

  for (const imp of imports) {
    if (!imp.resolvedPath) {
      continue;
    }

    const fromId = fileNodeId(repoId, imp.path);
    const toId = fileNodeId(repoId, imp.resolvedPath);
    const key = `IMPORTS:${fromId}:${toId}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    edges.push({
      repoId,
      fromId,
      toId,
      type: "IMPORTS",
    });
  }

  return edges;
}

export function resolveCallEdges(
  repoId: string,
  bundles: FileParseBundle[],
  imports: ParsedImport[],
): ResolvedCallEdge[] {
  const index = buildSymbolIndex(bundles);
  const edges: ResolvedCallEdge[] = [];
  const seen = new Set<string>();

  for (const bundle of bundles) {
    for (const ref of bundle.parseResult.refs) {
      const caller = findCallerSymbol(index, bundle.path, ref.line);
      if (!caller || caller.kind !== "Method") {
        continue;
      }

      const resolved = resolveCallee(index, imports, bundle.path, ref, caller);
      if (!resolved) {
        continue;
      }

      const fromId = symbolNodeId(repoId, caller);
      const toId = symbolNodeId(repoId, resolved.symbol);
      const key = `CALLS:${fromId}:${toId}:${ref.line}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      edges.push({
        repoId,
        fromId,
        toId,
        type: "CALLS",
        line: ref.line,
        confidence: resolved.confidence,
      });
    }
  }

  return edges;
}
