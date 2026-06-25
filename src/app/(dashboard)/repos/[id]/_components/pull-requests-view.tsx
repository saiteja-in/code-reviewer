"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { GitPullRequest, GitMerge, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import { PullRequestCard, type PullRequestListItem } from "./pull-request-card";

type PrState = "open" | "closed" | "all";

/**
 * Client island: tab filtering + counts over the server-fetched PR list.
 * The data is fetched once on the server (state "all") and passed in, so tab
 * switches are instant and counts are accurate — no extra GitHub calls.
 */
export function PullRequestsView({
  pulls,
  repositoryId,
}: {
  pulls: PullRequestListItem[];
  repositoryId: string;
}) {
  const [prState, setPrState] = useState<PrState>("open");

  const counts = {
    open: pulls.filter((pr) => pr.state === "open").length,
    closed: pulls.filter((pr) => pr.state === "closed").length,
    all: pulls.length,
  };

  const filtered =
    prState === "all" ? pulls : pulls.filter((pr) => pr.state === prState);

  return (
    <div className="space-y-8">
      <div className="border-b border-border/60">
        <div className="flex items-center gap-1">
          {(["open", "closed", "all"] as const).map((state) => (
            <button
              key={state}
              onClick={() => setPrState(state)}
              className={cn(
                "relative px-4 py-2.5 text-sm font-medium transition-colors",
                prState === state
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="flex items-center gap-2">
                {state === "open" && (
                  <GitPullRequest className="size-4 text-emerald-500" />
                )}
                {state === "closed" && (
                  <GitMerge className="size-4 text-purple-500" />
                )}
                {state === "all" && (
                  <GitBranch className="size-4 text-muted-foreground" />
                )}
                {state.charAt(0).toUpperCase() + state.slice(1)}
                <span
                  className={cn(
                    "px-1.5 py-0.5 text-xs rounded-md tabular-nums",
                    prState === state
                      ? "bg-foreground/10 text-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {counts[state]}
                </span>
              </span>
              {prState === state && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <div className="mx-auto size-12 rounded-full bg-muted flex items-center justify-center">
                <GitPullRequest className="size-6 text-muted-foreground" />
              </div>
              <p className="mt-4 font-medium">No pull requests found.</p>
              <p className="text-sm text-muted-foreground mt-1">
                {prState === "all"
                  ? "This repository has no pull requests yet."
                  : `No ${prState} pull requests found.`}
              </p>
            </CardContent>
          </Card>
        ) : (
          filtered.map((pr) => (
            <PullRequestCard key={pr.id} pr={pr} repositoryId={repositoryId} />
          ))
        )}
      </div>
    </div>
  );
}
