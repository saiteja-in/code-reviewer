import type { ParseFileResult, SymbolKind } from "./types.ts";
import { fileNodeId, parentClassName, symbolNodeId } from "./graph-ids.ts";
import { runWrite } from "../db/neo4j.ts";

const BATCH_SIZE = 100;

export type GraphNodeRow = {
  id: string;
  repoId: string;
  kind: SymbolKind | "File";
  name: string;
  path: string;
  startLine?: number;
  endLine?: number;
  qualifiedName?: string;
  language: string;
};

export type GraphEdgeRow = {
  repoId: string;
  fromId: string;
  toId: string;
  type: "CONTAINS" | "DECLARES" | "IMPORTS" | "CALLS";
  line?: number;
  confidence?: "high" | "medium" | "low";
};

export type GraphCollectResult = {
  nodes: GraphNodeRow[];
  edges: GraphEdgeRow[];
};

export function collectGraphFromParse(
  repoId: string,
  path: string,
  parseResult: ParseFileResult,
  language = "typescript",
): GraphCollectResult {
  const fileId = fileNodeId(repoId, path);
  const nodes: GraphNodeRow[] = [
    {
      id: fileId,
      repoId,
      kind: "File",
      name: path.split("/").pop() || path,
      path,
      language,
    },
  ];
  const edges: GraphEdgeRow[] = [];
  const classIds = new Map<string, string>();

  for (const symbol of parseResult.nodes) {
    if (symbol.kind === "Class") {
      classIds.set(symbol.name, symbolNodeId(repoId, symbol));
    }
  }

  for (const symbol of parseResult.nodes) {
    const symbolId = symbolNodeId(repoId, symbol);
    nodes.push({
      id: symbolId,
      repoId,
      kind: symbol.kind,
      name: symbol.name,
      path,
      startLine: symbol.startLine,
      endLine: symbol.endLine,
      qualifiedName: symbol.qualifiedName,
      language,
    });

    const enclosingClass = parentClassName(symbol.qualifiedName, symbol.name);

    if (symbol.kind === "Class" || symbol.kind === "Interface") {
      edges.push({
        repoId,
        fromId: fileId,
        toId: symbolId,
        type: "CONTAINS",
      });
      continue;
    }

    if (enclosingClass && (symbol.kind === "Method" || symbol.kind === "Field")) {
      const classId = classIds.get(enclosingClass);
      if (classId) {
        edges.push({
          repoId,
          fromId: classId,
          toId: symbolId,
          type: "DECLARES",
        });
      }
    }

    if (symbol.kind === "Method" || !enclosingClass) {
      edges.push({
        repoId,
        fromId: fileId,
        toId: symbolId,
        type: "CONTAINS",
      });
    }
  }

  return { nodes, edges };
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

const NODE_CYPHER: Record<GraphNodeRow["kind"], string> = {
  File: `
    UNWIND $rows AS row
    MERGE (n:File {id: row.id})
    SET n.repoId = row.repoId,
        n.name = row.name,
        n.path = row.path,
        n.language = row.language
  `,
  Class: `
    UNWIND $rows AS row
    MERGE (n:Class {id: row.id})
    SET n.repoId = row.repoId,
        n.name = row.name,
        n.path = row.path,
        n.startLine = row.startLine,
        n.endLine = row.endLine,
        n.qualifiedName = row.qualifiedName,
        n.language = row.language
  `,
  Interface: `
    UNWIND $rows AS row
    MERGE (n:Interface {id: row.id})
    SET n.repoId = row.repoId,
        n.name = row.name,
        n.path = row.path,
        n.startLine = row.startLine,
        n.endLine = row.endLine,
        n.qualifiedName = row.qualifiedName,
        n.language = row.language
  `,
  Method: `
    UNWIND $rows AS row
    MERGE (n:Method {id: row.id})
    SET n.repoId = row.repoId,
        n.name = row.name,
        n.path = row.path,
        n.startLine = row.startLine,
        n.endLine = row.endLine,
        n.qualifiedName = row.qualifiedName,
        n.language = row.language
  `,
  Field: `
    UNWIND $rows AS row
    MERGE (n:Field {id: row.id})
    SET n.repoId = row.repoId,
        n.name = row.name,
        n.path = row.path,
        n.startLine = row.startLine,
        n.endLine = row.endLine,
        n.qualifiedName = row.qualifiedName,
        n.language = row.language
  `,
};

const EDGE_CYPHER = {
  CONTAINS: `
    UNWIND $rows AS row
    MATCH (from {id: row.fromId, repoId: row.repoId})
    MATCH (to {id: row.toId, repoId: row.repoId})
    MERGE (from)-[:CONTAINS]->(to)
  `,
  DECLARES: `
    UNWIND $rows AS row
    MATCH (from {id: row.fromId, repoId: row.repoId})
    MATCH (to {id: row.toId, repoId: row.repoId})
    MERGE (from)-[:DECLARES]->(to)
  `,
  IMPORTS: `
    UNWIND $rows AS row
    MATCH (from {id: row.fromId, repoId: row.repoId})
    MATCH (to {id: row.toId, repoId: row.repoId})
    MERGE (from)-[:IMPORTS]->(to)
  `,
  CALLS: `
    UNWIND $rows AS row
    MATCH (from {id: row.fromId, repoId: row.repoId})
    MATCH (to {id: row.toId, repoId: row.repoId})
    MERGE (from)-[r:CALLS]->(to)
    SET r.line = row.line,
        r.confidence = row.confidence
  `,
};

async function writeNodeBatch(kind: GraphNodeRow["kind"], rows: GraphNodeRow[]) {
  if (rows.length === 0) {
    return;
  }
  await runWrite(NODE_CYPHER[kind], { rows });
}

async function writeEdgeBatch(type: GraphEdgeRow["type"], rows: GraphEdgeRow[]) {
  if (rows.length === 0) {
    return;
  }
  await runWrite(EDGE_CYPHER[type], { rows });
}

export async function writeGraphToNeo4j(
  nodes: GraphNodeRow[],
  edges: GraphEdgeRow[],
): Promise<{ nodesWritten: number; edgesWritten: number }> {
  const nodesByKind = new Map<GraphNodeRow["kind"], GraphNodeRow[]>();

  for (const node of nodes) {
    const bucket = nodesByKind.get(node.kind) ?? [];
    bucket.push(node);
    nodesByKind.set(node.kind, bucket);
  }

  for (const [kind, rows] of nodesByKind) {
    for (const batch of chunk(rows, BATCH_SIZE)) {
      await writeNodeBatch(kind, batch);
    }
  }

  const edgesByType = new Map<GraphEdgeRow["type"], GraphEdgeRow[]>();
  for (const edge of edges) {
    const bucket = edgesByType.get(edge.type) ?? [];
    bucket.push(edge);
    edgesByType.set(edge.type, bucket);
  }

  for (const [type, rows] of edgesByType) {
    for (const batch of chunk(rows, BATCH_SIZE)) {
      await writeEdgeBatch(type, batch);
    }
  }

  return { nodesWritten: nodes.length, edgesWritten: edges.length };
}
