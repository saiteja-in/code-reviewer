import type { Metadata } from "next";
import { getServerApi } from "@/lib/trpc/server";
import { ConnectedRepos } from "./_components/connected-repos";
import { ImportPanel } from "./_components/import-panel";
import { AddRepoToggle } from "./_components/add-repo-toggle";

export const metadata: Metadata = {
  title: "Repositories",
};

export default async function ReposPage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string }>;
}) {
  const { add } = await searchParams;

  // Fast DB read on the server — the connected list ships as HTML.
  const api = await getServerApi();
  const repos = await api.repository.list();

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Repositories
          </h1>
          <p className="text-muted-foreground mt-1">
            Select repositories to connect to your account.
          </p>
        </div>
        <AddRepoToggle open={!!add} />
      </div>

      {add && (
        <ImportPanel connectedGithubIds={repos.map((r) => r.githubId)} />
      )}

      <ConnectedRepos repos={repos} />
    </div>
  );
}
