import { verify } from "@octokit/webhooks-methods";

/**
 * Verify GitHub webhook HMAC signature. Fail closed in production if secret unset.
 */
export async function verifyGitHubWebhook(
  payload: string,
  signature: string | null,
): Promise<boolean> {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.error("GITHUB_WEBHOOK_SECRET is not set — rejecting webhook");
      return false;
    }
    console.warn("GITHUB_WEBHOOK_SECRET not set, skipping verification (dev)");
    return true;
  }

  if (!signature) {
    return false;
  }

  return verify(secret, payload, signature);
}

export function reviewModeFromEnv(): "diff" | "graph" {
  return process.env.REVIEW_MODE === "graph" ? "graph" : "diff";
}
