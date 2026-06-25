import Link from "next/link";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/api/root";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  ArrowLeft,
  GitPullRequest,
  GitMerge,
  ExternalLink,
  Clock,
  Plus,
  Minus,
  FileText,
  XCircle,
  GitBranch,
  ArrowRight,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type PullRequestDetail = RouterOutputs["pullRequest"]["get"];

export function PrHeader({
  pr,
  repositoryId,
}: {
  pr: PullRequestDetail;
  repositoryId: string;
}) {
  const isMerged = pr.state === "closed" && pr.mergedAt !== null;

  return (
    <>
      <div className="flex items-start gap-4">
        <Link href={`/repos/${repositoryId}`}>
          <Button variant="outline" size="icon" className="shrink-0 mt-1">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <div
                  className={cn(
                    "p-2 rounded-lg shrink-0",
                    isMerged
                      ? "bg-purple-500/10"
                      : pr.state === "closed"
                        ? "bg-red-500/10"
                        : "bg-emerald-500/10",
                  )}
                >
                  {isMerged ? (
                    <GitMerge className="size-5 text-purple-500" />
                  ) : pr.state === "closed" ? (
                    <XCircle className="size-5 text-red-500" />
                  ) : (
                    <GitPullRequest className="size-5 text-emerald-500" />
                  )}
                </div>
                <div className="min-w-0">
                  <h1 className="text-xl font-semibold tracking-tight truncate">
                    {pr.title}
                  </h1>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <PRStatusBadge
                      state={pr.state}
                      isMerged={isMerged}
                      draft={pr.draft}
                    />
                    <span className="text-sm text-muted-foreground font-mono">
                      #{pr.number}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <a
              href={pr.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0"
            >
              <Button variant="outline" size="sm" className="gap-2">
                <ExternalLink className="size-4" />
                GitHub
              </Button>
            </a>
          </div>

          <div className="flex items-center gap-4 mt-4 text-sm text-muted-foreground flex-wrap">
            <span className="flex items-center gap-2">
              <Avatar className="size-5 ring-1 ring-border">
                <AvatarImage src={pr.author.avatarUrl} />
                <AvatarFallback className="text-[10px]">
                  {pr.author.login?.[0]?.toUpperCase() ?? "?"}
                </AvatarFallback>
              </Avatar>
              <span className="font-medium text-foreground">
                {pr.author.login}
              </span>
            </span>
            <span className="text-muted-foreground/40">•</span>
            <span className="flex items-center gap-1.5">
              <Clock className="size-3.5" />
              {formatDate(pr.createdAt)}
            </span>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex items-center divide-x divide-border/60">
            <div className="flex-1 p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <GitBranch className="size-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground mb-1">Branches</p>
                  <div className="flex items-center gap-2 text-sm">
                    <code className="px-2 py-0.5 rounded bg-secondary font-mono text-xs truncate">
                      {pr.headRef}
                    </code>
                    <ArrowRight className="size-3 text-muted-foreground shrink-0" />
                    <code className="px-2 py-0.5 rounded bg-secondary font-mono text-xs truncate">
                      {pr.baseRef}
                    </code>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-6 px-6 py-4">
              <StatItem
                icon={Plus}
                value={pr.additions ?? 0}
                colorClass="text-emerald-600 dark:text-emerald-400"
                bgClass="bg-emerald-500/10"
              />
              <StatItem
                icon={Minus}
                value={pr.deletions ?? 0}
                colorClass="text-red-600 dark:text-red-400"
                bgClass="bg-red-500/10"
              />
              <StatItem
                icon={FileText}
                value={pr.changedFiles ?? 0}
                colorClass="text-muted-foreground dark:text-muted-foreground"
                bgClass="bg-muted"
              />
            </div>

            {/*TODO: Review action cluster */}
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function StatItem({
  icon: Icon,
  value,
  label,
  colorClass,
  bgClass,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: number;
  label?: string;
  colorClass: string;
  bgClass: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className={cn("p-1.5 rounded-md", bgClass)}>
        <Icon className={cn("size-3.5", colorClass)} />
      </div>
      <div>
        <p className={cn("text-sm font-semibold tabular-nums", colorClass)}>
          {value.toLocaleString()}
        </p>
        {label && (
          <p className={cn("text-xs font-medium", colorClass)}>{label}</p>
        )}
      </div>
    </div>
  );
}

function PRStatusBadge({
  state,
  isMerged,
  draft,
}: {
  state: string;
  isMerged: boolean;
  draft: boolean;
}) {
  if (draft) {
    return (
      <Badge variant="secondary" className="gap-1">
        Draft
      </Badge>
    );
  }

  if (isMerged) {
    return (
      <Badge
        variant="secondary"
        className="bg-purple-600/10 dark:text-purple-400 border-purple-500/20 border"
      >
        <GitMerge className="size-3" />
        Merged
      </Badge>
    );
  }

  if (state === "closed") {
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="size-3" />
        Closed
      </Badge>
    );
  }

  return (
    <Badge
      variant="secondary"
      className="gap-1 bg-emerald-600/10 dark:text-emerald-400 border-emerald-500/20 border"
    >
      <GitPullRequest className="size-3" />
      Open
    </Badge>
  );
}
