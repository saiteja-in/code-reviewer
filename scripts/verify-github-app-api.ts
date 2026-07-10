/**
 * Step 7 — live GitHub App API smoke test.
 *
 * Usage:
 *   pnpm verify:github-app-api
 *   pnpm verify:github-app-api -- --installation-id 12345 --owner you --repo my-repo
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  getAppOctokit,
  getInstallationOctokit,
} from "../src/server/services/github-app";

function loadEnvFile() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
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
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function getArg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= process.argv.length) return undefined;
  return process.argv[idx + 1];
}

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

loadEnvFile();

const ownerArg = getArg("owner") ?? process.env.GITHUB_APP_TEST_OWNER?.trim();
const repoArg = getArg("repo") ?? process.env.GITHUB_APP_TEST_REPO?.trim();
const installationIdArg =
  getArg("installation-id") ??
  process.env.GITHUB_APP_TEST_INSTALLATION_ID?.trim();

try {
  const appOctokit = await getAppOctokit();
  const { data: app } = await appOctokit.rest.apps.getAuthenticated();
  if (!app) {
    fail("Failed to authenticate as app: app is null");
  }
  console.log(`OK: App authenticated — name="${app.name}" slug="${app.slug}" id=${app.id}`);

  let installationId: number;

  if (installationIdArg) {
    installationId = Number(installationIdArg);
    if (!Number.isFinite(installationId)) {
      fail(`Invalid installation id: ${installationIdArg}`);
    }
    console.log(`Using installation id from args/env: ${installationId}`);
  } else {
    const { data: installations } =
      await appOctokit.rest.apps.listInstallations({ per_page: 1 });
    const first = installations[0];
    if (!first) {
      fail(
        "No App installations found. Install the App on a test repo first, or pass --installation-id",
      );
    }
    installationId = first.id;

    console.log(
      `Using first installation: id=${installationId} account=${first.account?.login ?? "unknown"}`,
    );
  }

  const instOctokit = await getInstallationOctokit(installationId);

  if (ownerArg && repoArg) {
    const { data: repo } = await instOctokit.rest.repos.get({
      owner: ownerArg,
      repo: repoArg,
    });
    console.log(
      `OK: Installation token can read repo — ${repo.full_name} (private=${repo.private})`,
    );
  } else {
    const { data: repos } =
      await instOctokit.rest.apps.listReposAccessibleToInstallation({
        per_page: 5,
      });
    if (repos.repositories.length === 0) {
      fail("Installation has no accessible repositories");
    }
    console.log("OK: Repos accessible to installation:");
    for (const repo of repos.repositories) {
      console.log(`  - ${repo.full_name}`);
    }
  }

  console.log("\nGitHub App API smoke test: PASSED");
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}
