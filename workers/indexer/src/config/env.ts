import { config } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workerRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const repoRoot = resolve(workerRoot, "../..");

/** Load worker `.env` first, then repo root `.env` (root values do not override). */
export function loadEnvFiles(): void {
  const workerEnv = resolve(workerRoot, ".env");
  const rootEnv = resolve(repoRoot, ".env");

  if (existsSync(workerEnv)) {
    config({ path: workerEnv });
  }
  if (existsSync(rootEnv)) {
    config({ path: rootEnv, override: false });
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export type WorkerEnv = {
  databaseUrl: string;
  neo4jUri: string;
  neo4jUser: string;
  neo4jPassword: string;
  workspaceDir: string;
  inngestDev: boolean;
  inngestBaseUrl?: string;
  instanceId: string;
};

export function getWorkerEnv(): WorkerEnv {
  return {
    databaseUrl: requireEnv("DATABASE_URL"),
    neo4jUri: requireEnv("NEO4J_URI"),
    neo4jUser: process.env.NEO4J_USER?.trim() || "neo4j",
    neo4jPassword: requireEnv("NEO4J_PASSWORD"),
    workspaceDir: process.env.INDEXER_WORKSPACE_DIR?.trim() || "/tmp/repos",
    inngestDev: process.env.INNGEST_DEV === "1",
    inngestBaseUrl: process.env.INNGEST_BASE_URL?.trim(),
    instanceId: process.env.HOSTNAME?.trim() || "indexer-worker-local",
  };
}
