import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Parser, { Query, type Language } from "tree-sitter";
import TypeScript from "tree-sitter-typescript";
import type {
  ParsedReference,
  ParsedSymbol,
  ParseFileResult,
  SupportedLanguage,
  SymbolKind,
} from "./types.ts";

const workerRoot = resolveWorkerRoot();

type ParserBundle = {
  language: Language;
  query: Query;
};

let typescriptBundle: ParserBundle | null = null;

function resolveWorkerRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "../..");
}

function loadTagsQuery(language: Language, relativePath: string): Query {
  const tagsPath = join(workerRoot, relativePath);
  const source = readFileSync(tagsPath, "utf8");
  return new Query(language, source);
}

function getTypeScriptBundle(): ParserBundle {
  if (!typescriptBundle) {
    const language = TypeScript.typescript as Language;
    typescriptBundle = {
      language,
      query: loadTagsQuery(language, "tags/typescript.scm"),
    };
  }
  return typescriptBundle;
}

type SyntaxNode = ReturnType<Parser["parse"]>["rootNode"];

function lineNumber(node: SyntaxNode): number {
  return node.startPosition.row + 1;
}

function endLineNumber(node: SyntaxNode): number {
  return node.endPosition.row + 1;
}

function nodeText(node: SyntaxNode, content: string): string {
  return content.slice(node.startIndex, node.endIndex);
}

function mapDefinitionKind(captureName: string): SymbolKind | null {
  if (captureName === "definition.class") return "Class";
  if (captureName === "definition.interface") return "Interface";
  if (captureName === "definition.method") return "Method";
  if (captureName === "definition.function") return "Method";
  if (captureName === "definition.field") return "Field";
  return null;
}

function enclosingClassName(node: SyntaxNode, content: string): string | null {
  let current: SyntaxNode | null = node.parent;
  while (current) {
    if (current.type === "class_declaration") {
      const nameNode = current.childForFieldName("name");
      if (nameNode) {
        return nodeText(nameNode, content);
      }
    }
    current = current.parent;
  }
  return null;
}

function buildQualifiedName(
  name: string,
  definitionNode: SyntaxNode,
  content: string,
): string {
  const className = enclosingClassName(definitionNode, content);
  return className ? `${className}.${name}` : name;
}

function collectDefinitions(
  tree: ReturnType<Parser["parse"]>,
  query: Query,
  path: string,
  content: string,
): ParsedSymbol[] {
  const nodes: ParsedSymbol[] = [];
  const seen = new Set<string>();

  for (const match of query.matches(tree.rootNode)) {
    let definitionNode: SyntaxNode | null = null;
    let definitionKind: SymbolKind | null = null;
    let nameNode: SyntaxNode | null = null;

    for (const capture of match.captures) {
      if (capture.name === "name") {
        nameNode = capture.node;
      } else if (capture.name.startsWith("definition.")) {
        definitionNode = capture.node;
        definitionKind = mapDefinitionKind(capture.name);
      }
    }

    if (!definitionNode || !definitionKind || !nameNode) {
      continue;
    }

    const name = nodeText(nameNode, content).trim();
    if (!name) {
      continue;
    }

    const qualifiedName = buildQualifiedName(name, definitionNode, content);
    const dedupeKey = `${path}:${definitionKind}:${qualifiedName}:${lineNumber(definitionNode)}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    nodes.push({
      kind: definitionKind,
      name,
      path,
      startLine: lineNumber(definitionNode),
      endLine: endLineNumber(definitionNode),
      qualifiedName,
    });
  }

  return nodes.sort((a, b) => a.startLine - b.startLine);
}

function collectReferences(
  tree: ReturnType<Parser["parse"]>,
  query: Query,
  path: string,
  content: string,
): ParsedReference[] {
  const refs: ParsedReference[] = [];

  for (const match of query.matches(tree.rootNode)) {
    for (const capture of match.captures) {
      if (capture.name !== "reference.call") {
        continue;
      }

      const callNode = capture.node;
      const nameCapture = match.captures.find((c) => c.name === "name");
      if (!nameCapture) {
        continue;
      }

      refs.push({
        name: nodeText(nameCapture.node, content).trim(),
        path,
        line: lineNumber(callNode),
      });
    }
  }

  return refs;
}

export function parseFile(
  path: string,
  content: string,
  lang: SupportedLanguage = "typescript",
): ParseFileResult {
  if (lang !== "typescript") {
    throw new Error(`Unsupported language: ${lang}`);
  }

  const { language, query } = getTypeScriptBundle();
  const parser = new Parser();
  parser.setLanguage(language);
  const tree = parser.parse(content);

  return {
    nodes: collectDefinitions(tree, query, path, content),
    refs: collectReferences(tree, query, path, content),
  };
}

/** @internal test helper */
export function resetParserCacheForTests(): void {
  typescriptBundle = null;
}
