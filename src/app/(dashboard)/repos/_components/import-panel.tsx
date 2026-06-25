"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { ConnectGithub } from "@/components/connect-github";
import { RefreshCw, Star, Lock, Search, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface GitHubRepo {
  githubId: number;
  name: string;
  fullName: string;
  private: boolean;
  htmlUrl: string;
  description: string | null;
  language: string | null;
  stars: number;
  updatedAt: string;
}

const languageColors: Record<string, string> = {
  TypeScript: "bg-blue-500",
  JavaScript: "bg-yellow-400",
  Python: "bg-green-500",
  Go: "bg-cyan-500",
  Rust: "bg-orange-500",
  Java: "bg-red-500",
  Ruby: "bg-red-400",
  PHP: "bg-purple-500",
  "C#": "bg-green-600",
  "C++": "bg-pink-500",
  C: "bg-gray-500",
  Swift: "bg-orange-400",
  Kotlin: "bg-purple-400",
  Dart: "bg-blue-400",
  Vue: "bg-emerald-500",
  Svelte: "bg-orange-600",
};

/**
 * Client island for importing GitHub repos. Mounted only when `?add=1` is set,
 * so unmounting it (Cancel / back) naturally resets its search + selection.
 * The connected repo ids come from the server page (no client list query).
 */
export function ImportPanel({
  connectedGithubIds,
}: {
  connectedGithubIds: number[];
}) {
  const router = useRouter();
  const [selectedRepos, setSelectedRepos] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");

  const githubRepos = trpc.repository.fetchFromGithub.useQuery();

  const connectMutation = trpc.repository.connect.useMutation({
    onSuccess: () => {
      // Close the panel and revalidate the server-rendered connected list.
      router.push("/repos");
      router.refresh();
    },
  });

  const connectedIds = new Set(connectedGithubIds);
  const availableRepos =
    githubRepos.data?.filter((repo) => !connectedIds.has(repo.githubId)) ?? [];

  const filteredAvailableRepos = availableRepos.filter(
    (repo) =>
      repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      repo.description?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const toggleRepo = (githubId: number) => {
    const next = new Set(selectedRepos);
    if (next.has(githubId)) {
      next.delete(githubId);
    } else {
      next.add(githubId);
    }
    setSelectedRepos(next);
  };

  const handleConnect = () => {
    const reposToConnect = availableRepos
      .filter((r) => selectedRepos.has(r.githubId))
      .map((r) => ({
        githubId: r.githubId,
        name: r.name,
        fullName: r.fullName,
        private: r.private,
        htmlUrl: r.htmlUrl,
      }));
    connectMutation.mutate({ repos: reposToConnect });
  };

  const selectAll = () =>
    setSelectedRepos(new Set(filteredAvailableRepos.map((r) => r.githubId)));
  const clearSelection = () => setSelectedRepos(new Set());

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border/60 bg-muted/30 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Import GitHub Repositories</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Select repositories to import from GitHub.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => githubRepos.refetch()}
            disabled={githubRepos.isFetching}
          >
            <RefreshCw
              className={cn("size-4", githubRepos.isFetching && "animate-spin")}
            />
          </Button>
        </div>
      </div>

      <CardContent className="p-0">
        {githubRepos.isLoading ? (
          <div className="p-6 flex flex-col gap-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : githubRepos.error ? (
          <div className="p-6">
            {githubRepos.error.data?.code === "PRECONDITION_FAILED" ? (
              <ConnectGithub
                title="Github account not connected"
                description="Connect your Github account to view your repositories."
              />
            ) : (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-center">
                <p className="text-sm text-destructive">
                  {githubRepos.error.message}
                </p>
              </div>
            )}
          </div>
        ) : availableRepos.length === 0 ? (
          <div className="py-16 text-center">
            <div className="mx-auto size-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle className="size-6 text-emerald-500" />
            </div>
            <p className="mt-4 font-medium">All caught up!</p>
            <p className="text-sm text-muted-foreground mt-1">
              All your repos are already connected!
            </p>
          </div>
        ) : (
          <>
            <div className="px-6 py-4 border-b border-border/60 flex items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  placeholder="Search repos"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex items-center gap-2 text-sm">
                <button
                  onClick={selectAll}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Select all
                </button>
                {selectedRepos.size > 0 && (
                  <>
                    <span className="text-muted-foreground">•</span>
                    <button
                      onClick={clearSelection}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Clear
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="max-h-[400px] overflow-y-auto">
              {filteredAvailableRepos.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-sm text-muted-foreground">
                    No repositories match your search.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {filteredAvailableRepos.map((repo) => (
                    <RepoSelectItem
                      key={repo.githubId}
                      repo={repo}
                      selected={selectedRepos.has(repo.githubId)}
                      onToggle={() => toggleRepo(repo.githubId)}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-border/60 bg-muted/60 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {selectedRepos.size} of {filteredAvailableRepos.length} selected
              </p>
              <Button
                onClick={handleConnect}
                disabled={selectedRepos.size === 0 || connectMutation.isPending}
              >
                {connectMutation.isPending ? (
                  <>
                    <RefreshCw className="size-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    Connect
                    {selectedRepos.size > 0 && ` (${selectedRepos.size})`}
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function RepoSelectItem({
  repo,
  selected,
  onToggle,
}: {
  repo: GitHubRepo;
  selected: boolean;
  onToggle: () => void;
}) {
  const langColor = repo.language
    ? languageColors[repo.language] || "bg-gray-400"
    : null;

  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-4 px-6 py-4 transition-colors",
        selected ? "bg-primary/5" : "hover:bg-muted/50",
      )}
    >
      <Checkbox
        checked={selected}
        onCheckedChange={onToggle}
        className="shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{repo.fullName}</span>
          {repo.private && (
            <Lock className="size-3 text-muted-foreground shrink-0" />
          )}
        </div>
        {repo.description && (
          <p className="text-sm text-muted-foreground truncate mt-0.5">
            {repo.description}
          </p>
        )}
      </div>
      <div className="flex items-center gap-4 shrink-0">
        {repo.stars > 0 && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Star className="size-3" />
            <span className="tabular-nums">{repo.stars}</span>
          </span>
        )}
        {repo.language && (
          <div className="flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-full shrink-0", langColor)} />
            <span className="text-xs text-muted-foreground">{repo.language}</span>
          </div>
        )}
      </div>
    </label>
  );
}
