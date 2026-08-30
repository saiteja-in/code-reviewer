/**
 * Step 6 ΓÇö verify GitHub App env vars are present and PEM-shaped.
 * Does not call the GitHub API (that is Step 7).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) {
    return;
  }
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
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
    value = value.replace(/\\n/g, "\n");
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

loadEnvFile();

const appId = process.env.GITHUB_APP_ID?.trim();
const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET?.trim();

if (!appId) {
  fail("GITHUB_APP_ID is not set");
}

if (!/^\d+$/.test(appId)) {
  fail("GITHUB_APP_ID must be numeric");
}

if (!privateKey?.trim()) {
  fail("GITHUB_APP_PRIVATE_KEY is not set");
}

const pem = privateKey.includes("\\n")
  ? privateKey.replace(/\\n/g, "\n")
  : privateKey;

if (
  !pem.includes("BEGIN") ||
  !pem.includes("PRIVATE KEY") ||
  !pem.includes("END")
) {
  fail(
    "GITHUB_APP_PRIVATE_KEY does not look like a PEM (expected BEGIN/END PRIVATE KEY)",
  );
}

if (!webhookSecret) {
  fail("GITHUB_WEBHOOK_SECRET is not set");
}

if (webhookSecret.length < 16) {
  fail("GITHUB_WEBHOOK_SECRET looks too short (use 20+ random characters)");
}

console.log("GitHub App env: OK");
console.log(`  GITHUB_APP_ID=${appId}`);
console.log(`  GITHUB_APP_PRIVATE_KEY=<PEM ${pem.split("\n").length} lines>`);
console.log(`  GITHUB_WEBHOOK_SECRET=<set, ${webhookSecret.length} chars>`);

const apiBase = process.env.GITHUB_API_BASE_URL?.trim();
if (apiBase) {
  console.log(`  GITHUB_API_BASE_URL=${apiBase}`);
} else {
  console.log("  GITHUB_API_BASE_URL=(default github.com)");
}
