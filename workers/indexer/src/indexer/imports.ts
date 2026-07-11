import Parser from "tree-sitter";
import TypeScript from "tree-sitter-typescript";
import { dirname, join, normalize } from "node:path";

export type ParsedImportBinding = {
  localName: string;
  importedName: string;
  line: number;
};

export type ParsedImport = {
  path: string;
  specifier: string;
  resolvedPath: string | null;
  bindings: ParsedImportBinding[];
  line: number;
};

type SyntaxNode = ReturnType<Parser["parse"]>["rootNode"];

function lineNumber(node: SyntaxNode): number {
  return node.startPosition.row + 1;
}

function nodeText(node: SyntaxNode, content: string): string {
  return content.slice(node.startIndex, node.endIndex);
}

function stripQuotes(raw: string): string {
  return raw.replace(/^['"]|['"]$/g, "");
}

export function resolveRelativeImport(
  fromPath: string,
  specifier: string,
  knownPaths: Set<string>,
): string | null {
  if (!specifier.startsWith(".")) {
    return null;
  }

  const baseDir = dirname(fromPath.replace(/\\/g, "/"));
  const joined = normalize(join(baseDir, specifier)).replace(/\\/g, "/");

  if (knownPaths.has(joined)) {
    return joined;
  }

  for (const ext of [".ts", ".tsx"]) {
    const candidate = `${joined}${ext}`;
    if (knownPaths.has(candidate)) {
      return candidate;
    }
  }

  for (const ext of ["/index.ts", "/index.tsx"]) {
    const candidate = `${joined}${ext}`;
    if (knownPaths.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

function parseImportClause(
  clauseNode: SyntaxNode,
  content: string,
  line: number,
): ParsedImportBinding[] {
  const bindings: ParsedImportBinding[] = [];

  for (const child of clauseNode.children) {
    if (child.type === "identifier") {
      const name = nodeText(child, content).trim();
      bindings.push({ localName: name, importedName: "default", line });
      continue;
    }

    if (child.type === "named_imports") {
      for (const spec of child.children) {
        if (spec.type !== "import_specifier") {
          continue;
        }
        const nameNode = spec.childForFieldName("name");
        const aliasNode = spec.childForFieldName("alias");
        if (!nameNode) {
          continue;
        }
        const importedName = nodeText(nameNode, content).trim();
        const localName = aliasNode
          ? nodeText(aliasNode, content).trim()
          : importedName;
        bindings.push({ localName, importedName, line });
      }
    }
  }

  return bindings;
}

function parseImportStatement(
  node: SyntaxNode,
  filePath: string,
  content: string,
  knownPaths: Set<string>,
): ParsedImport | null {
  const sourceNode = node.childForFieldName("source");
  if (!sourceNode) {
    return null;
  }

  const specifier = stripQuotes(nodeText(sourceNode, content).trim());
  const line = lineNumber(node);
  const importRoot = node.children.find((c) => c.type === "import_clause");
  const bindings = importRoot
    ? parseImportClause(importRoot, content, line)
    : [];

  return {
    path: filePath,
    specifier,
    resolvedPath: resolveRelativeImport(filePath, specifier, knownPaths),
    bindings,
    line,
  };
}

export function parseImports(
  filePath: string,
  content: string,
  knownPaths: Set<string>,
): ParsedImport[] {
  const parser = new Parser();
  parser.setLanguage(TypeScript.typescript);
  const tree = parser.parse(content);
  const imports: ParsedImport[] = [];
  const stack: SyntaxNode[] = [tree.rootNode];

  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.type === "import_statement") {
      const parsed = parseImportStatement(node, filePath, content, knownPaths);
      if (parsed) {
        imports.push(parsed);
      }
    }
    for (const child of node.children) {
      stack.push(child);
    }
  }

  return imports;
}

export function collectImportsForFiles(
  files: Array<{ path: string; content: string }>,
): ParsedImport[] {
  const knownPaths = new Set(files.map((f) => f.path.replace(/\\/g, "/")));
  return files.flatMap((file) => parseImports(file.path, file.content, knownPaths));
}
