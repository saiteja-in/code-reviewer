import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { inngest } from "@/server/inngest";
import { verifyGitHubWebhook } from "@/server/services/github-webhook";
import {
  deleteGitHubInstallation,
  ensureInstallationDbId,
  linkRepositoriesToInstallation,
  unlinkRepositoriesFromInstallation,
  upsertGitHubInstallation,
  type GitHubInstallationPayload,
  type GitHubRepoRefPayload,
} from "@/server/services/github-webhook-installation";

interface RepositoryPayload {
  id: number;
  full_name: string;
  name: string;
  private: boolean;
  html_url: string;
}

interface PullRequestPayload {
  action: string;
  installation?: GitHubInstallationPayload;
  number: number;
  pull_request: {
    id: number;
    number: number;
    title: string;
    html_url: string;
    state: string;
    draft: boolean;
  };
  repository: RepositoryPayload;
}

interface InstallationPayload {
  action: string;
  installation: GitHubInstallationPayload;
  repositories?: GitHubRepoRefPayload[];
}

interface InstallationRepositoriesPayload {
  action: "added" | "removed";
  installation: GitHubInstallationPayload;
  repositories_added?: GitHubRepoRefPayload[];
  repositories_removed?: GitHubRepoRefPayload[];
}

async function resolveConnectedRepository(githubRepoId: number) {
  return db.repository.findUnique({
    where: { githubId: githubRepoId },
    include: { user: true, installation: true },
  });
}

async function linkInstallationIfNeeded(
  repository: NonNullable<Awaited<ReturnType<typeof resolveConnectedRepository>>>,
  installation: GitHubInstallationPayload | undefined,
) {
  if (!installation || repository.installationId) {
    return repository;
  }

  const installationDbId = await ensureInstallationDbId(installation);
  return db.repository.update({
    where: { id: repository.id },
    data: { installationId: installationDbId },
    include: { user: true, installation: true },
  });
}

async function handlePullRequestEvent(payload: PullRequestPayload) {
  if (!["opened", "synchronize", "reopened"].includes(payload.action)) {
    return NextResponse.json(
      { message: `Action '${payload.action}' ignored` },
      { status: 200 },
    );
  }

  if (payload.pull_request.draft) {
    return NextResponse.json({ message: "Draft PR ignored" }, { status: 200 });
  }

  let repository = await resolveConnectedRepository(payload.repository.id);
  if (!repository) {
    return NextResponse.json(
      { message: "Repository not connected" },
      { status: 200 },
    );
  }

  repository = await linkInstallationIfNeeded(
    repository,
    payload.installation,
  );

  const existingReview = await db.review.findFirst({
    where: {
      repositoryId: repository.id,
      prNumber: payload.pull_request.number,
      status: { in: ["PENDING", "PROCESSING"] },
    },
  });

  if (existingReview) {
    return NextResponse.json(
      { message: "Review already in progress", reviewId: existingReview.id },
      { status: 200 },
    );
  }

  const review = await db.review.create({
    data: {
      repositoryId: repository.id,
      userId: repository.userId,
      prNumber: payload.pull_request.number,
      prTitle: payload.pull_request.title,
      prUrl: payload.pull_request.html_url,
      status: "PENDING",
    },
  });

  const installationId =
    payload.installation?.id ??
    (repository.installation?.installationId
      ? Number(repository.installation.installationId)
      : null);

  await inngest.send({
    name: "review/pr.requested",
    data: {
      reviewId: review.id,
      repositoryId: repository.id,
      prNumber: payload.pull_request.number,
      userId: repository.userId,
      installationId,
    },
  });

  return NextResponse.json(
    { message: "Review triggered", reviewId: review.id },
    { status: 200 },
  );
}

async function handleInstallationEvent(payload: InstallationPayload) {
  const { action, installation, repositories = [] } = payload;

  if (action === "deleted") {
    await deleteGitHubInstallation(installation.id);
    return NextResponse.json({
      message: "Installation deleted",
      installationId: installation.id,
    });
  }

  if (action === "created" || action === "new_permissions_accepted") {
    const row = await upsertGitHubInstallation(installation);
    const { linked, skipped } = await linkRepositoriesToInstallation(
      row.id,
      repositories,
    );
    return NextResponse.json({
      message: "Installation upserted",
      installationId: installation.id,
      linked,
      skipped,
    });
  }

  if (action === "suspend" || action === "unsuspend") {
    await upsertGitHubInstallation(installation);
    return NextResponse.json({
      message: `Installation ${action}`,
      installationId: installation.id,
    });
  }

  return NextResponse.json(
    { message: `Installation action '${action}' ignored` },
    { status: 200 },
  );
}

async function handleInstallationRepositoriesEvent(
  payload: InstallationRepositoriesPayload,
) {
  const row = await upsertGitHubInstallation(payload.installation);

  if (payload.action === "added") {
    const repos = payload.repositories_added ?? [];
    const { linked, skipped } = await linkRepositoriesToInstallation(
      row.id,
      repos,
    );
    return NextResponse.json({
      message: "Repositories added to installation",
      linked,
      skipped,
    });
  }

  if (payload.action === "removed") {
    const repos = payload.repositories_removed ?? [];
    const unlinked = await unlinkRepositoriesFromInstallation(row.id, repos);
    return NextResponse.json({
      message: "Repositories removed from installation",
      unlinked,
    });
  }

  return NextResponse.json({ message: "Event ignored" }, { status: 200 });
}

export async function POST(request: NextRequest) {
  const payload = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  const event = request.headers.get("x-github-event");

  if (!(await verifyGitHubWebhook(payload, signature))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (!event) {
    return NextResponse.json({ error: "Missing event header" }, { status: 400 });
  }

  let data: unknown;
  try {
    data = JSON.parse(payload) as unknown;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload" },
      { status: 400 },
    );
  }

  switch (event) {
    case "installation":
      return handleInstallationEvent(data as InstallationPayload);

    case "installation_repositories":
      return handleInstallationRepositoriesEvent(
        data as InstallationRepositoriesPayload,
      );

    case "pull_request":
      return handlePullRequestEvent(data as PullRequestPayload);

    default:
      return NextResponse.json(
        { message: `Event '${event}' ignored` },
        { status: 200 },
      );
  }
}
