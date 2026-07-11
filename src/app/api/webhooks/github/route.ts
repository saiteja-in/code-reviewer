import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { schedulePrReview } from "@/server/services/graph-review-after-index";
import {
  reviewModeFromEnv,
  verifyGitHubWebhook,
} from "@/server/services/github-webhook";
import {
  branchFromRef,
  isBranchDelete,
  parseOwnerRepo,
  requestRepoIndex,
} from "@/server/services/github-webhook-index";
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
  default_branch?: string;
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
    head: {
      sha: string;
      ref: string;
    };
  };
  repository: RepositoryPayload;
}

interface PushPayload {
  ref: string;
  before: string;
  after: string;
  installation?: GitHubInstallationPayload;
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
  defaultBranch?: string,
) {
  if (!installation || repository.installationId) {
    return repository;
  }

  const installationDbId = await ensureInstallationDbId(installation);
  return db.repository.update({
    where: { id: repository.id },
    data: {
      installationId: installationDbId,
      defaultBranch: defaultBranch ?? repository.defaultBranch,
    },
    include: { user: true, installation: true },
  });
}

async function handlePushEvent(payload: PushPayload) {
  if (isBranchDelete(payload.after)) {
    return NextResponse.json({ message: "Branch delete ignored" }, { status: 200 });
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
    payload.repository.default_branch,
  );

  const branch = branchFromRef(payload.ref);
  if (branch !== repository.defaultBranch) {
    return NextResponse.json(
      { message: `Push to non-default branch '${branch}' ignored` },
      { status: 200 },
    );
  }

  const names = parseOwnerRepo(repository.fullName);
  if (!names) {
    return NextResponse.json(
      { message: "Invalid repository name" },
      { status: 200 },
    );
  }

  const indexResult = await requestRepoIndex({
    repositoryId: repository.id,
    installationId:
      payload.installation?.id ??
      (repository.installation?.installationId
        ? Number(repository.installation.installationId)
        : null),
    owner: names.owner,
    repo: names.repo,
    headSha: payload.after,
    branch,
    baseCommit: payload.before,
  });

  return NextResponse.json({
    message: indexResult.queued ? "Index job queued" : indexResult.reason,
    index: indexResult,
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
    payload.repository.default_branch,
  );

  const headSha = payload.pull_request.head.sha;
  const branch = payload.pull_request.head.ref;
  const mode = reviewModeFromEnv();
  const names = parseOwnerRepo(repository.fullName);

  let indexResult: Awaited<ReturnType<typeof requestRepoIndex>> | null = null;
  if (names) {
    indexResult = await requestRepoIndex({
      repositoryId: repository.id,
      installationId:
        payload.installation?.id ??
        (repository.installation?.installationId
          ? Number(repository.installation.installationId)
          : null),
      owner: names.owner,
      repo: names.repo,
      headSha,
      branch,
    });
  }

  const existingReview = await db.review.findFirst({
    where: {
      repositoryId: repository.id,
      prNumber: payload.pull_request.number,
      status: { in: ["PENDING", "PROCESSING"] },
    },
  });

  if (existingReview?.status === "PROCESSING") {
    return NextResponse.json(
      {
        message: "Review already in progress",
        index: indexResult,
      },
      { status: 200 },
    );
  }

  const installationId =
    payload.installation?.id ??
    (repository.installation?.installationId
      ? Number(repository.installation.installationId)
      : null);

  if (existingReview?.status === "PENDING") {
    const scheduled = await schedulePrReview({
      repositoryId: repository.id,
      userId: repository.userId,
      prNumber: payload.pull_request.number,
      prTitle: payload.pull_request.title,
      prUrl: payload.pull_request.html_url,
      headSha,
      mode,
      installationId,
      indexResult,
      existingReviewId: existingReview.id,
    });

    return NextResponse.json({
      message: scheduled.message,
      reviewId: scheduled.reviewId,
      reviewQueued: scheduled.reviewQueued,
      index: indexResult,
    });
  }

  const duplicate = await db.review.findFirst({
    where: {
      repositoryId: repository.id,
      prNumber: payload.pull_request.number,
      headSha,
      mode,
      status: { not: "FAILED" },
    },
  });

  if (duplicate) {
    return NextResponse.json(
      {
        message: "Review already exists for this commit",
        reviewId: duplicate.id,
        index: indexResult,
      },
      { status: 200 },
    );
  }

  const scheduled = await schedulePrReview({
    repositoryId: repository.id,
    userId: repository.userId,
    prNumber: payload.pull_request.number,
    prTitle: payload.pull_request.title,
    prUrl: payload.pull_request.html_url,
    headSha,
    mode,
    installationId,
    indexResult,
  });

  return NextResponse.json({
    message: scheduled.message,
    reviewId: scheduled.reviewId,
    reviewQueued: scheduled.reviewQueued,
    index: indexResult,
  });
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

    case "push":
      return handlePushEvent(data as PushPayload);

    case "pull_request":
      return handlePullRequestEvent(data as PullRequestPayload);

    default:
      return NextResponse.json(
        { message: `Event '${event}' ignored` },
        { status: 200 },
      );
  }
}
