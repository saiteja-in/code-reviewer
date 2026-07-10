/**
 * Send a stub repo/index.requested event (Step 13 verification).
 * Usage: pnpm send:index-event -- <repositoryId> [jobId]
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { Inngest } from "inngest";

function loadEnvFile() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

const repositoryId = process.argv[2];
const jobId = process.argv[3];

if (!repositoryId) {
  console.error("Usage: pnpm send:index-event -- <repositoryId> [jobId]");
  process.exit(1);
}

const inngest = new Inngest({ id: "tejacodereview" });

const { ids } = await inngest.send({
  name: "repo/index.requested",
  data: {
    repositoryId,
    jobId,
    headSha: "stub-sha",
    branch: "main",
  },
});

console.log("Sent repo/index.requested", { repositoryId, jobId, eventIds: ids });
