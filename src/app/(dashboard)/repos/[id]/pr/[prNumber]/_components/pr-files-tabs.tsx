"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { DiffViewer } from "@/components/diff-viewer";

export function PrFilesTabs({
  repositoryId,
  prNumber,
}: {
  repositoryId: string;
  prNumber: number;
}) {
  const [activeTab, setActiveTab] = useState<"review" | "files">("review");

  const files = trpc.pullRequest.files.useQuery({
    repositoryId,
    prNumber,
  });

  return (
    <>
      {/* Tabs */}
      <div className="border-b border-border/60">
        <div className="flex items-center gap-1">
          <TabButton
            active={activeTab === "files"}
            onClick={() => setActiveTab("files")}
            icon={FileText}
            label="Changed Files"
            count={files.data?.length}
          />
        </div>
      </div>

      {/* Tab Content */}
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
