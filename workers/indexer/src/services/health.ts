import neo4j from "neo4j-driver";
import type { WorkerEnv } from "../config/env.ts";
import { db } from "../db/client.ts";
import { logger } from "../lib/logger.ts";

export type HealthCheckResult = {
  postgres: boolean;
  neo4j: boolean;
};

export async function runHealthChecks(env: WorkerEnv): Promise<HealthCheckResult> {
  await checkPostgres();
  await checkNeo4j(env);
  return { postgres: true, neo4j: true };
}

async function checkPostgres(): Promise<void> {
  const rows = await db.$queryRaw<Array<{ n: number }>>`SELECT 1 AS n`;
  if (rows[0]?.n !== 1) {
    throw new Error("Postgres health check returned unexpected result");
  }
  logger.info("health: postgres ok");
}

async function checkNeo4j(env: WorkerEnv): Promise<void> {
  const driver = neo4j.driver(
    env.neo4jUri,
    neo4j.auth.basic(env.neo4jUser, env.neo4jPassword),
  );

  try {
    await driver.verifyConnectivity();
    logger.info("health: neo4j ok");
  } finally {
    await driver.close();
  }
}
