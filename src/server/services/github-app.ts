import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "octokit";

const GITHUB_API_VERSION = "2022-11-28";

export class GitHubAppConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitHubAppConfigError";
  }
}

type GitHubAppConfig = {
  appId: string;
  privateKey: string;
  baseUrl?: string;
};

/** Normalize PEM stored in .env with literal `\n` sequences. */
export function parsePrivateKey(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.includes("\\n")) {
    return trimmed.replace(/\\n/g, "\n");
  }
  return trimmed;
}

function getGitHubAppConfig(): GitHubAppConfig {
  const appId = process.env.GITHUB_APP_ID?.trim();
  const privateKeyRaw = process.env.GITHUB_APP_PRIVATE_KEY;

  if (!appId) {
    throw new GitHubAppConfigError("GITHUB_APP_ID is not set");
  }
  if (!privateKeyRaw?.trim()) {
    throw new GitHubAppConfigError("GITHUB_APP_PRIVATE_KEY is not set");
  }

  const privateKey = parsePrivateKey(privateKeyRaw);
  if (!privateKey.includes("BEGIN") || !privateKey.includes("PRIVATE KEY")) {
    throw new GitHubAppConfigError(
      "GITHUB_APP_PRIVATE_KEY does not look like a valid PEM",
    );
  }

  const baseUrl = process.env.GITHUB_API_BASE_URL?.trim().replace(/\/$/, "");

  return { appId, privateKey, baseUrl: baseUrl || undefined };
}

export function isGitHubAppConfigured(): boolean {
  try {
    getGitHubAppConfig();
    return true;
  } catch {
    return false;
  }
}

function createOctokit(authToken: string, baseUrl?: string): Octokit {
  return new Octokit({
    auth: authToken,
    ...(baseUrl ? { baseUrl } : {}),
    headers: {
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
    },
  });
}

/**
 * Octokit authenticated as the GitHub App (JWT).
 * Use for app-level endpoints: getAuthenticated, listInstallations, etc.
 */
export async function getAppOctokit(): Promise<Octokit> {
  const config = getGitHubAppConfig();
  const auth = createAppAuth({
    appId: config.appId,
    privateKey: config.privateKey,
  });
  const { token } = await auth({ type: "app" });
  return createOctokit(token, config.baseUrl);
}

/**
 * Octokit authenticated as an App installation (installation access token).
 * Use for posting reviews, check runs, cloning repo contents, etc.
 */
export async function getInstallationOctokit(
  installationId: number | bigint | string,
): Promise<Octokit> {
  const config = getGitHubAppConfig();
  const id = Number(installationId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new GitHubAppConfigError(
      `Invalid installationId: ${String(installationId)}`,
    );
  }

  const auth = createAppAuth({
    appId: config.appId,
    privateKey: config.privateKey,
    installationId: id,
  });
  const { token } = await auth({ type: "installation" });
  return createOctokit(token, config.baseUrl);
}
