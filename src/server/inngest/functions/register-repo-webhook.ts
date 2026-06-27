import { inngest } from "../client";
import { db } from "@/server/db";
import {
  deleteRepoWebhook,
  ensureRepoWebhook,
  getGitHubAccessToken,
  GitHubApiError,
} from "@/server/services/github";

export type RepoConnectedEvent = {
  name: "repo/connected";
  data: {
    repositoryId: string;
    userId: string;
  };
};

export const registerRepoWebhook = inngest.createFunction(
  {
    id: "register-repo-webhook",
    retries: 2,
    triggers: [{ event: "repo/connected" }],
  },
  async ({ event, step }) => {
    const { repositoryId, userId } = event.data;

    const repository = await step.run("get-repository", async () => {
      return db.repository.findUnique({ where: { id: repositoryId } });
    });

    if (!repository) {
      return { success: false, error: "Repository not found" };
    }

    const accessToken = await step.run("get-access-token", async () => {
      return getGitHubAccessToken(userId);
    });

    if (!accessToken) {
      await step.run("save-webhook-error", async () => {
        await db.repository.update({
          where: { id: repositoryId },
          data: { webhookError: "GitHub access token not found" },
        });
      });
      return { success: false, error: "No access token" };
    }

    const [owner, repo] = repository.fullName.split("/");
    if (!owner || !repo) {
      await step.run("save-webhook-error", async () => {
        await db.repository.update({
          where: { id: repositoryId },
          data: { webhookError: "Invalid repository name" },
        });
      });
      return { success: false, error: "Invalid repository name" };
    }

    const result = await step.run("ensure-webhook", async () => {
      return ensureRepoWebhook(accessToken, owner, repo);
    });

    await step.run("save-webhook-result", async () => {
      if ("webhookId" in result) {
        await db.repository.update({
          where: { id: repositoryId },
          data: {
            webhookId: result.webhookId,
            webhookError: null,
          },
        });
      } else {
        await db.repository.update({
          where: { id: repositoryId },
          data: { webhookError: result.error },
        });
      }
    });

    return {
      success: "webhookId" in result,
      ...result,
    };
  },
);

export async function removeRepoWebhookBestEffort(
  accessToken: string,
  fullName: string,
  webhookId: bigint | null,
): Promise<void> {
  if (!webhookId) return;

  const [owner, repo] = fullName.split("/");
  if (!owner || !repo) return;

  try {
    await deleteRepoWebhook(accessToken, owner, repo, webhookId);
  } catch (err) {
    // Best-effort cleanup — log but don't block disconnect.
    if (err instanceof GitHubApiError && err.status === 404) return;
    console.warn("Failed to delete repo webhook:", err);
  }
}
