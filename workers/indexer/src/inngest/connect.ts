import { connect } from "inngest/connect";
import { logger } from "../lib/logger.ts";
import type { WorkerEnv } from "../config/env.ts";
import { inngest } from "./client.ts";
import { indexRepo } from "./functions/index-repo.ts";

const functions = [indexRepo];

export async function startInngestWorker(env: WorkerEnv) {
  const connection = await connect({
    apps: [{ client: inngest, functions }],
    instanceId: env.instanceId,
  });

  logger.info("Inngest Connect ready", {
    state: connection.state,
    functions: ["index-repo"],
    inngestDev: env.inngestDev,
    inngestBaseUrl: env.inngestBaseUrl,
  });

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, closing Inngest connection`);
    await connection.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await connection.closed;
  logger.info("Inngest worker shut down");
}
