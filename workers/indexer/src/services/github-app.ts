import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "octokit";

const GITHUB_API_VERSION = "2022-11-28";

type GitHubAppConfig = {
  appId: string;
  privateKey: string;
  baseUrl?: string;
};

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
    throw new Error("GITHUB_APP_ID is not set");
  }
  if (!privateKeyRaw?.trim()) {
    throw new Error("GITHUB_APP_PRIVATE_KEY is not set");
  }

  const privateKey = parsePrivateKey(privateKeyRaw);
  const baseUrl = process.env.GITHUB_API_BASE_URL?.trim().replace(/\/$/, "");

  return { appId, privateKey, baseUrl: baseUrl || undefined };
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

export async function getInstallationOctokit(
  installationId: number | bigint | string,
): Promise<Octokit> {
  const config = getGitHubAppConfig();
  const id = Number(installationId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error(`Invalid installationId: ${String(installationId)}`);
  }

  const auth = createAppAuth({
    appId: config.appId,
    privateKey: config.privateKey,
    installationId: id,
  });
  const { token } = await auth({ type: "installation" });
  return createOctokit(token, config.baseUrl);
}
