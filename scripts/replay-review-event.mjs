/**
 * Re-send review/pr.requested for a stuck PENDING review.
 * Usage: pnpm replay:review-event -- <reviewId>
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
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

const reviewId = process.argv[2];
if (!reviewId) {
  console.error("Usage: pnpm replay:review-event -- <reviewId>");
  process.exit(1);
}

const db = new PrismaClient();
const review = await db.review.findUnique({
  where: { id: reviewId },
  include: { repository: { include: { installation: true } } },
});

if (!review) {
  console.error(`Review not found: ${reviewId}`);
  process.exit(1);
}

const installationId = review.repository.installation?.installationId
  ? Number(review.repository.installation.installationId)
  : null;

const inngest = new Inngest({ id: "tejacodereview" });
const { ids } = await inngest.send({
  name: "review/pr.requested",
  data: {
    reviewId: review.id,
    repositoryId: review.repositoryId,
    prNumber: review.prNumber,
    userId: review.userId,
    headSha: review.headSha,
    mode: review.mode,
    installationId,
  },
});

console.log("Sent review/pr.requested", {
  reviewId: review.id,
  prNumber: review.prNumber,
  status: review.status,
  eventIds: ids,
});

await db.$disconnect();
