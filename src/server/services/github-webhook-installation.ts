import { db } from "@/server/db";

export type GitHubAccountPayload = {
  login: string;
  type?: string;
};

export type GitHubInstallationPayload = {
  id: number;
  account: GitHubAccountPayload;
};

export type GitHubRepoRefPayload = {
  id: number;
  name: string;
  full_name: string;
  private?: boolean;
  html_url?: string;
};

/** Upsert a GitHub App installation record. */
export async function upsertGitHubInstallation(
  installation: GitHubInstallationPayload,
) {
  return db.gitHubInstallation.upsert({
    where: { installationId: BigInt(installation.id) },
    create: {
      installationId: BigInt(installation.id),
      accountLogin: installation.account.login,
      accountType: installation.account.type ?? null,
    },
    update: {
      accountLogin: installation.account.login,
      accountType: installation.account.type ?? null,
      updatedAt: new Date(),
    },
  });
}

/** Remove installation; Repository.installationId is set null via FK. */
export async function deleteGitHubInstallation(installationId: number) {
  await db.gitHubInstallation.deleteMany({
    where: { installationId: BigInt(installationId) },
  });
}

/**
 * Link existing dashboard-connected repos to an installation by githubId.
 * Does not create Repository rows (userId is required ΓÇö connect via UI first).
 */
export async function linkRepositoriesToInstallation(
  installationDbId: string,
  repos: GitHubRepoRefPayload[],
): Promise<{ linked: number; skipped: number }> {
  let linked = 0;
  let skipped = 0;

  for (const repo of repos) {
    const existing = await db.repository.findUnique({
      where: { githubId: repo.id },
    });

    if (!existing) {
      skipped += 1;
      continue;
    }

    await db.repository.update({
      where: { githubId: repo.id },
      data: {
        installationId: installationDbId,
        name: repo.name,
        fullName: repo.full_name,
        private: repo.private ?? existing.private,
        htmlUrl: repo.html_url ?? existing.htmlUrl,
      },
    });
    linked += 1;
  }

  return { linked, skipped };
}

/** Clear installation link for repos removed from the App installation. */
export async function unlinkRepositoriesFromInstallation(
  installationDbId: string,
  repos: GitHubRepoRefPayload[],
): Promise<number> {
  let unlinked = 0;

  for (const repo of repos) {
    const result = await db.repository.updateMany({
      where: {
        githubId: repo.id,
        installationId: installationDbId,
      },
      data: { installationId: null },
    });
    unlinked += result.count;
  }

  return unlinked;
}

export async function getInstallationDbId(
  githubInstallationId: number,
): Promise<string | null> {
  const row = await db.gitHubInstallation.findUnique({
    where: { installationId: BigInt(githubInstallationId) },
    select: { id: true },
  });
  return row?.id ?? null;
}

/** Resolve GitHub App installation id from webhook payload or linked repository. */
export async function resolveGitHubInstallationId(
  repositoryId: string,
  webhookInstallationId?: number | null,
): Promise<number | null> {
  if (webhookInstallationId) {
    return webhookInstallationId;
  }

  const repo = await db.repository.findUnique({
    where: { id: repositoryId },
    include: { installation: true },
  });

  if (repo?.installation?.installationId) {
    return Number(repo.installation.installationId);
  }

  return null;
}

/** Resolve installation DB id, creating the row if missing (e.g. PR before install event). */
export async function ensureInstallationDbId(
  installation: GitHubInstallationPayload,
): Promise<string> {
  const row = await upsertGitHubInstallation(installation);
  return row.id;
}
