import neo4j, { type Driver, type QueryResult } from "neo4j-driver";
import { getWorkerEnv } from "../config/env.ts";

const globalNeo4j = globalThis as unknown as {
  neo4jDriver: Driver | undefined;
};

export function getDriver(): Driver {
  if (!globalNeo4j.neo4jDriver) {
    const env = getWorkerEnv();
    globalNeo4j.neo4jDriver = neo4j.driver(
      env.neo4jUri,
      neo4j.auth.basic(env.neo4jUser, env.neo4jPassword),
    );
  }
  return globalNeo4j.neo4jDriver;
}

async function runQuery(
  cypher: string,
  params: Record<string, unknown>,
  accessMode: typeof neo4j.session.READ | typeof neo4j.session.WRITE,
): Promise<QueryResult> {
  const session = getDriver().session({ defaultAccessMode: accessMode });
  try {
    return await session.run(cypher, params);
  } finally {
    await session.close();
  }
}

export async function runWrite(
  cypher: string,
  params: Record<string, unknown> = {},
): Promise<void> {
  await runQuery(cypher, params, neo4j.session.WRITE);
}

export async function runRead<T extends Record<string, unknown>>(
  cypher: string,
  params: Record<string, unknown> = {},
): Promise<T[]> {
  const result = await runQuery(cypher, params, neo4j.session.READ);
  return result.records.map((record) => record.toObject() as T);
}

export async function closeNeo4j(): Promise<void> {
  if (globalNeo4j.neo4jDriver) {
    await globalNeo4j.neo4jDriver.close();
    globalNeo4j.neo4jDriver = undefined;
  }
}
