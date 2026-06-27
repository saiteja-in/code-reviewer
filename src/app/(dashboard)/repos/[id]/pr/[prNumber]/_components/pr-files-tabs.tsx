"use client";

import { useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/api/root";
import { trpc } from "@/lib/trpc/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FileText,
  XCircle,
  ScanSearch,
  Wand2,
  Clock,
  CheckCircle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DiffViewer } from "@/components/diff-viewer";
import { ReviewResult } from "@/components/review-result";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type LatestReview = RouterOutputs["review"]["getLatestForPR"];

export function PrFilesTabs({
  repositoryId,
  prNumber,
  initialLatestReview,
}: {
  repositoryId: string;
  prNumber: number;
  initialLatestReview: LatestReview;
}) {
  const [activeTab, setActiveTab] = useState<"review" | "files">("review");

  const latestReview = trpc.review.getLatestForPR.useQuery(
    { repositoryId, prNumber },
    {
      initialData: initialLatestReview,
      // Poll while the background job runs, then stop.
      refetchInterval: (query) => {
        const data = query.state.data;
        const status = data?.status;
        const postingPending =
          status === "COMPLETED" && !data?.postedAt && !data?.postError;
        return status === "PENDING" || status === "PROCESSING" || postingPending
          ? 2000
          : false;
      },
    },
  );

  const files = trpc.pullRequest.files.useQuery({ repositoryId, prNumber });

  const triggerReview = trpc.review.trigger.useMutation({
    onSuccess: () => latestReview.refetch(),
  });

  const review = latestReview.data;
  const isReviewing =
    review?.status === "PENDING" || review?.status === "PROCESSING";
  const reviewCommentCount =
    review?.status === "COMPLETED" && Array.isArray(review.comments)
      ? review.comments.length
      : 0;

  const runReview = () =>
    triggerReview.mutate({ repositoryId, prNumber });

  return (
    <>
      {/* Tabs */}
      <div className="border-b border-border/60">
        <div className="flex items-center gap-1">
          <TabButton
            active={activeTab === "review"}
            onClick={() => setActiveTab("review")}
            icon={ScanSearch}
            label="Reviews"
            count={reviewCommentCount}
          />
          <TabButton
            active={activeTab === "files"}
            onClick={() => setActiveTab("files")}
            icon={FileText}
            label="Changed Files"
            count={files.data?.length}
          />
        </div>
      </div>

      {/* Reviews tab */}
      {activeTab === "review" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <ReviewStatusBadge status={review?.status ?? null} />
            {!isReviewing && (
              <Button
                onClick={runReview}
                disabled={triggerReview.isPending}
                className="gap-1.5"
              >
                {triggerReview.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Wand2 className="size-4" />
                )}
                {review ? "Re-run review" : "Run AI Review"}
              </Button>
            )}
          </div>

          {review ? (
            <ReviewResult review={review} />
          ) : (
            <Card>
              <CardContent className="py-16 text-center">
                <div className="mx-auto size-14 rounded-full bg-primary/10 flex items-center justify-center">
                  <ScanSearch className="size-7 text-primary" />
                </div>
                <p className="mt-4 font-medium">No reviews yet.</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                  Run an AI review to analyze this pull request for bugs,
                  security issues, and improvements.
                </p>
                <Button
                  className="mt-6 gap-1.5"
                  onClick={runReview}
                  disabled={triggerReview.isPending}
                >
                  {triggerReview.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Wand2 className="size-4" />
                  )}
                  Run AI Review
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Changed Files tab */}
      {activeTab === "files" && (
        <div>
          {files.isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-32 w-full rounded-xl" />
              ))}
            </div>
          ) : files.error ? (
            <Card className="border-destructive/50">
              <CardContent className="py-12 text-center">
                <div className="mx-auto size-12 rounded-full bg-destructive/10 flex items-center justify-center">
                  <XCircle className="size-6 text-destructive" />
                </div>
                <p className="mt-4 font-medium text-destructive">
                  Failed to load changed files.
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {files.error.message}
                </p>
              </CardContent>
            </Card>
          ) : files.data && files.data.length > 0 ? (
            <DiffViewer files={files.data} />
          ) : (
            <Card>
              <CardContent className="py-16 text-center">
                <div className="mx-auto size-12 rounded-full bg-muted flex items-center justify-center">
                  <FileText className="size-6 text-muted-foreground" />
                </div>
                <p className="mt-4 font-medium">No files changed.</p>
                <p className="text-sm text-muted-foreground mt-1">
                  This pull request doesn&apos;t change any files.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </>
  );
}

function ReviewStatusBadge({ status }: { status: string | null }) {
  if (!status) {
    return (
      <Badge
        variant="outline"
        className="gap-1.5 bg-muted text-muted-foreground"
      >
        <Clock className="size-3" />
        Not reviewed
      </Badge>
    );
  }

  const config: Record<
    string,
    { icon: typeof Clock; label: string; className: string; spin?: boolean }
  > = {
    COMPLETED: {
      icon: CheckCircle,
      label: "AI review completed",
      className:
        "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    },
    PROCESSING: {
      icon: Loader2,
      label: "Analyzing code…",
      className:
        "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
      spin: true,
    },
    PENDING: {
      icon: Clock,
      label: "Queued for review",
      className:
        "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    },
    FAILED: {
      icon: XCircle,
      label: "Review failed",
      className:
        "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
    },
  };

  const c = config[status] ?? {
    icon: Clock,
    label: "Not reviewed",
    className: "bg-muted text-muted-foreground",
  };
  const Icon = c.icon;

  return (
    <Badge variant="outline" className={cn("gap-1.5", c.className)}>
      <Icon className={cn("size-3", c.spin && "animate-spin")} />
      {c.label}
    </Badge>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative px-4 py-2.5 text-sm font-medium transition-colors flex items-center gap-2",
        active
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-4" />
      {label}
      {count !== undefined && (
        <span
          className={cn(
            "px-1.5 py-0.5 text-xs rounded-md tabular-nums",
            active
              ? "bg-foreground/10 text-foreground"
              : "bg-muted text-muted-foreground",
          )}
        >
          {count}
        </span>
      )}
      {active && (
        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
      )}
    </button>
  );
}
