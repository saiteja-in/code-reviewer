import { parseFile } from "./parse.ts";
import type { RepoSourceFile } from "./github-files.ts";
import type { ParsedSymbol, SymbolKind } from "./types.ts";

const CHUNK_SYMBOL_KINDS = new Set<SymbolKind>(["Class", "Interface", "Method"]);
const LINE_CHUNK_SIZE = 400;
const LINE_CHUNK_OVERLAP = 40;
const MIN_CHUNK_CHARS = 24;

export type SourceChunk = {
  path: string;
  symbol: string | null;
  startLine: number;
  endLine: number;
  content: string;
  embedText: string;
};

function extractLines(content: string, startLine: number, endLine: number): string {
  const lines = content.split(/\r?\n/);
  return lines.slice(startLine - 1, endLine).join("\n");
}

export function formatEmbedText(
  path: string,
  symbol: string | null,
  content: string,
): string {
  const header = symbol ? `path: ${path}\nsymbol: ${symbol}` : `path: ${path}`;
  return `${header}\n---\n${content}`;
}

function pushChunk(
  chunks: SourceChunk[],
  path: string,
  symbol: string | null,
  startLine: number,
  endLine: number,
  content: string,
): void {
  const trimmed = content.trim();
  if (trimmed.length < MIN_CHUNK_CHARS) {
    return;
  }

  chunks.push({
    path,
    symbol,
    startLine,
    endLine,
    content: trimmed,
    embedText: formatEmbedText(path, symbol, trimmed),
  });
}

function chunkSymbolsForFile(file: RepoSourceFile): SourceChunk[] {
  const parsed = parseFile(file.path, file.content);
  const chunks: SourceChunk[] = [];

  for (const symbol of parsed.nodes) {
    if (!CHUNK_SYMBOL_KINDS.has(symbol.kind)) {
      continue;
    }

    const content = extractLines(file.content, symbol.startLine, symbol.endLine);
    pushChunk(
      chunks,
      file.path,
      symbol.qualifiedName,
      symbol.startLine,
      symbol.endLine,
      content,
    );
  }

  return chunks;
}

function chunkLinesForFile(file: RepoSourceFile): SourceChunk[] {
  const lines = file.content.split(/\r?\n/);
  const chunks: SourceChunk[] = [];
  let start = 0;

  while (start < lines.length) {
    const end = Math.min(start + LINE_CHUNK_SIZE, lines.length);
    const slice = lines.slice(start, end);
    const startLine = start + 1;
    const endLine = end;
    pushChunk(chunks, file.path, null, startLine, endLine, slice.join("\n"));

    if (end >= lines.length) {
      break;
    }

    start = Math.max(0, end - LINE_CHUNK_OVERLAP);
  }

  return chunks;
}

export function buildChunksFromFiles(files: RepoSourceFile[]): SourceChunk[] {
  const chunks: SourceChunk[] = [];

  for (const file of files) {
    const symbolChunks = chunkSymbolsForFile(file);
    if (symbolChunks.length > 0) {
      chunks.push(...symbolChunks);
      continue;
    }

    chunks.push(...chunkLinesForFile(file));
  }

  return chunks;
}
