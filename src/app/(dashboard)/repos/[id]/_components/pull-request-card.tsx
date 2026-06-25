import Link from "next/link";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/api/root";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  GitPullRequest,
  GitMerge,
  XCircle,
  Clock,
  CheckCircle,
  Loader2,
  ArrowLeft,
  Plus,
  Minus,
  FileText,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";

type RouterOutputs = inferRouterOutputs<AppRouter>;
export type PullRequestListItem = RouterOutputs["pullRequest"]["list"][number];

export function PullRequestCard({
  pr,
  repositoryId,
}: {
  pr: PullRequestListItem;
  repositoryId: string;
}) {
  const isMerged = pr.state === "closed" && pr.mergedAt !== null;
  const prHref = `/repos/${repositoryId}/pr/${pr.number}`;

  return (
    <Card className="group hover:border-border transition-all">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-6">
          <div className="flex items-start gap-4 min-w-0 flex-1">
            <div>
              {isMerged ? (
                <GitMerge className="size-4 text-purple-500" />
              ) : pr.state === "closed" ? (
                <XCircle className="size-4 text-red-500" />
              ) : (
                <GitPullRequest className="size-4 text-emerald-500" />
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <Link
                  href={prHref}
                  className="font-medium hover:text-primary transition-colors line-clamp-1"
                >
                  {pr.title}
                </Link>
                {pr.draft && (
                  <Badge variant="secondary" className="text-xs">
                    Draft
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="font-mono text-xs">#{pr.number}</span>
                <span className="text-muted-foreground/40">•</span>
                <span className="flex items-center gap-1.5">
                  <Avatar className="size-4 ring-1 ring-border">
                    <AvatarImage
                      src={pr.author.avatarUrl}
                      alt={pr.author.login}
                    />
                    <AvatarFallback className="text-[10px]">
                      {pr.author.login?.[0]?.toUpperCase() || "?"}
                    </AvatarFallback>
                  </Avatar>
                  {pr.author.login}
                </span>
                <span className="text-muted-foreground/40">•</span>
                <span className="flex items-center gap-1">
                  <Clock className="size-3" />
                  {formatDate(pr.createdAt)}
                </span>
              </div>

              <div className="flex items-center gap-4 text-sm">
                <code className="px-2 py-0.5 rounded-md bg-muted text-xs font-mono text-muted-foreground flex items-center truncate">
                  {pr.baseRef}
                  <ArrowLeft className="mx-1.5 size-3 text-muted-foreground/50" />
                  {pr.headRef}
                </code>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <Plus className="size-3" />
                    <span>{pr.additions}</span>
                  </span>
                  <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                    <Minus className="size-3" />
                    <span>{pr.deletions}</span>
                  </span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <FileText className="size-3" />
                    <span>{pr.changedFiles}</span>
                    files
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {pr.review && <ReviewStatusBadge status={pr.review.status} />}
            <Link href={prHref}>
              <Button variant={pr.review ? "outline" : "default"}>
                {pr.review ? "View" : "Review"}
              </Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ReviewStatusBadge({ status }: { status: string }) {
  const config = {
    COMPLETED: {
      icon: CheckCircle,
      label: "Reviewed",
      className:
        "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    },
    PROCESSING: {
      icon: Loader2,
      label: "Analyzing",
      className:
        "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
      spin: true,
    },
    PENDING: {
      icon: Clock,
      label: "Queued",
      className:
        "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    },
    FAILED: {
      icon: XCircle,
      label: "Failed",
      className:
        "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
    },
  }[status] ?? {
    icon: Clock,
    label: "Pending",
    className: "bg-muted text-muted-foreground",
  };

  const Icon = config.icon;

  return (
    <Badge className={config.className}>
      <Icon className={cn("size-3", "spin" in config && config.spin && "animate-spin")} />
      {config.label}
    </Badge>
  );
}
