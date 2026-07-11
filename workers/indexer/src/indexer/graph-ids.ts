import type { ParsedSymbol, SymbolKind } from "./types.ts";

export type GraphNodeKind = SymbolKind | "File";

export function fileNodeId(repoId: string, path: string): string {
  return `${repoId}:${path}:File:file:0`;
}

export function symbolNodeId(repoId: string, symbol: ParsedSymbol): string {
  return `${repoId}:${symbol.path}:${symbol.kind}:${symbol.qualifiedName}:${symbol.startLine}`;
}

export function parentClassName(
  qualifiedName: string,
  name: string,
): string | null {
  if (qualifiedName === name) {
    return null;
  }

  const suffix = `.${name}`;
  if (!qualifiedName.endsWith(suffix)) {
    return null;
  }

  const prefix = qualifiedName.slice(0, -suffix.length);
  const segments = prefix.split(".");
  return segments[segments.length - 1] ?? null;
}
