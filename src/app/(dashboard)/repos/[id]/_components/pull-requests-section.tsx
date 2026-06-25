import { getServerApi } from "@/lib/trpc/server";
import { PullRequestsView } from "./pull-requests-view";

/**
 * Async server component — the Suspense boundary child. It performs the slow
 * GitHub fetch (a single `/pulls` call for state "all") so the page header can
 * render immediately while this streams in. Any failure here surfaces error.tsx.
 */
export async function PullRequestsSection({
  repositoryId,
}: {
  repositoryId: string;
}) {
  const api = await getServerApi();
  const pulls = await api.pullRequest.list({ repositoryId, state: "all" });

  return <PullRequestsView pulls={pulls} repositoryId={repositoryId} />;
}
