import neo4j, { type Driver, type QueryResult } from "neo4j-driver";

type Neo4jConfig = {
  uri: string;
  user: string;
  password: string;
};

const globalNeo4j = globalThis as unknown as {
  neo4jDriver: Driver | undefined;
};

function getConfig(): Neo4jConfig | null {
  const uri = process.env.NEO4J_URI?.trim();
  const password = process.env.NEO4J_PASSWORD;
  if (!uri || !password) {
    return null;
  }
  return {
    uri,
    user: process.env.NEO4J_USER?.trim() || "neo4j",
    password,
  };
}

/** True when NEO4J_URI and NEO4J_PASSWORD are set. */
export function isNeo4jConfigured(): boolean {
  return getConfig() !== null;
}

/** Lazily create a singleton driver (reused across hot reloads in dev). */
export function getDriver(): Driver {
  const config = getConfig();
  if (!config) {
    throw new Error(
      "Neo4j is not configured. Set NEO4J_URI and NEO4J_PASSWORD.",
    );
  }

  if (!globalNeo4j.neo4jDriver) {
    globalNeo4j.neo4jDriver = neo4j.driver(
      config.uri,
      neo4j.auth.basic(config.user, config.password),
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

/** Run a read-only Cypher query. Returns plain objects per record. */
export async function runRead<T extends Record<string, unknown> = Record<string, unknown>>(
  cypher: string,
  params: Record<string, unknown> = {},
): Promise<T[]> {
  const result = await runQuery(cypher, params, neo4j.session.READ);
  return result.records.map((record) => record.toObject() as T);
}

/** Run a write Cypher query. Returns plain objects per record. */
export async function runWrite<T extends Record<string, unknown> = Record<string, unknown>>(
  cypher: string,
  params: Record<string, unknown> = {},
): Promise<T[]> {
  const result = await runQuery(cypher, params, neo4j.session.WRITE);
  return result.records.map((record) => record.toObject() as T);
}

export type Neo4jPingResult =
  | { ok: true }
  | { ok: false; error: string; configured: boolean };

/** Lightweight connectivity check — does not throw. */
export async function pingNeo4j(): Promise<Neo4jPingResult> {
  if (!isNeo4jConfigured()) {
    return {
      ok: false,
      configured: false,
      error: "Neo4j env vars not set (NEO4J_URI, NEO4J_PASSWORD)",
    };
  }

  try {
    await runRead("RETURN 1 AS n");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      configured: true,
      error: err instanceof Error ? err.message : "Neo4j ping failed",
    };
  }
}

/** Close the driver (e.g. test teardown). */
export async function closeNeo4j(): Promise<void> {
  if (globalNeo4j.neo4jDriver) {
    await globalNeo4j.neo4jDriver.close();
    globalNeo4j.neo4jDriver = undefined;
  }
}
