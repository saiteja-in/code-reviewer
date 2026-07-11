export type SymbolKind = "Class" | "Interface" | "Method" | "Field";

export type ReferenceKind = "call";

export interface ParsedSymbol {
  kind: SymbolKind;
  name: string;
  path: string;
  startLine: number;
  endLine: number;
  qualifiedName: string;
}

export interface ParsedReference {
  name: string;
  path: string;
  line: number;
  receiver?: string;
  fromSymbolId?: string;
}

export interface ParseFileResult {
  nodes: ParsedSymbol[];
  refs: ParsedReference[];
}

export type SupportedLanguage = "typescript";
