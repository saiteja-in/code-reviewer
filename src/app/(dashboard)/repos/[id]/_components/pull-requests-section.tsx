import { getServerApi } from "@/lib/trpc/server";
import { PullRequestsView } from "./pull-requests-view";

/**
 * Async server component — the Suspense boundary child. It performs the GitHub
 * fetch (a single GraphQL query for all PRs, incl. file/line stats) so the page
 * header can render immediately while this streams in. Any failure here
 * surfaces error.tsx; the client view filters open/closed/all from the result.
 */
export async function PullRequestsSection({
  repositoryId,
}: {
  repositoryId: string;
}) {
  const api = await getServerApi();
  const pulls = await api.pullRequest.list({ repositoryId });

  return <PullRequestsView pulls={pulls} repositoryId={repositoryId} />;
}
