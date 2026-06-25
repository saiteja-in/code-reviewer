import Link from "next/link";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/api/root";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Lock, Globe, ArrowRight } from "lucide-react";
import { DisconnectRepoButton } from "./disconnect-repo-button";

type RouterOutputs = inferRouterOutputs<AppRouter>;
export type ConnectedRepo = RouterOutputs["repository"]["list"][number];

/** Server component — static markup; only the disconnect action is a client island. */
export function ConnectedRepoCard({ repo }: { repo: ConnectedRepo }) {
  return (
    <Card className="group hover:border-primary/30 transition-all hover:shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <Link href={`/repos/${repo.id}`} className="flex-1 min-w-0">
            <div className="flex items-start gap-3">
              <div className="size-10 rounded-lg flex items-center justify-center shrink-0 transition-colors bg-emerald-500/10 group-hover:bg-emerald-500/15">
                {repo.private ? (
                  <Lock className="size-4 text-amber-600 dark:text-amber-400" />
                ) : (
                  <Globe className="size-4 text-emerald-600 dark:text-emerald-400" />
                )}
              </div>
              <div className="min-w-0">
                <span className="font-medium block truncate group-hover:text-primary transition-colors">
                  {repo.fullName}
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-xs px-1.5 py-0 h-5">
                    {repo.private ? "Private" : "Public"}
                  </Badge>
                </div>
              </div>
            </div>
          </Link>

          <DisconnectRepoButton repoId={repo.id} repoName={repo.fullName} />
        </div>

        <div className="mt-4 pt-4 border-t border-border/60 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Connected {formatDate(repo.createdAt)}
          </span>
          <Link href={`/repos/${repo.id}`}>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5 -mr-2"
            >
              View PRs
              <ArrowRight className="size-3" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function formatDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;

  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
