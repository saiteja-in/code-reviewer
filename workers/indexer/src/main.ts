import { loadEnvFiles, getWorkerEnv } from "./config/env.ts";
import { disconnectDb } from "./db/client.ts";
import { startInngestWorker } from "./inngest/connect.ts";
import { logger } from "./lib/logger.ts";
import { runHealthChecks } from "./services/health.ts";

async function main(): Promise<void> {
  loadEnvFiles();
  const env = getWorkerEnv();

  logger.info("starting indexer worker", {
    workspaceDir: env.workspaceDir,
    instanceId: env.instanceId,
  });

  await runHealthChecks(env);
  await startInngestWorker(env);
}

main()
  .catch((err) => {
    logger.error("fatal startup error", {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  })
  .finally(async () => {
    await disconnectDb().catch(() => undefined);
  });
