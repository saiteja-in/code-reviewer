import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TRPCError } from "@trpc/server";
import { getServerApi } from "@/lib/trpc/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ExternalLink, Globe, Lock } from "lucide-react";
import { PullRequestsSection } from "./_components/pull-requests-section";
import { RefreshPullRequests } from "./_components/refresh-pull-request";
import { PrListSkeleton } from "./_components/pr-list-skeleton";

export const metadata: Metadata = {
  title: "Pull Requests",
};

export default async function RepositoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const api = await getServerApi();

  // Fast DB read; a missing/foreign id renders not-found.tsx.
  const repository = await api.repository.get({ id }).catch((error) => {
    if (error instanceof TRPCError && error.code === "NOT_FOUND") {
      notFound();
    }
    throw error;
  });

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <Link href="/repos">
            <Button variant="outline" size="icon" className="shrink-0">
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">
                {repository.fullName}
              </h1>
              <Badge variant="outline" className="gap-1">
                {repository.private ? (
                  <>
                    <Lock className="size-3" />
                    Private
                  </>
                ) : (
                  <>
                    <Globe className="size-3" />
                    Public
                  </>
                )}
              </Badge>
            </div>
            <a
              href={repository.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5 mt-1"
            >
              View on GitHub
              <ExternalLink className="size-3" />
            </a>
          </div>
        </div>
        <RefreshPullRequests />
      </div>

      <Suspense fallback={<PrListSkeleton />}>
        <PullRequestsSection repositoryId={id} />
      </Suspense>
    </div>
  );
}
