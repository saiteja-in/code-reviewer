import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { FolderGit2, Plus } from "lucide-react";
import { ConnectedRepoCard, type ConnectedRepo } from "./connected-repo-card";

/** Server component — renders the connected repositories list (or empty state). */
export function ConnectedRepos({ repos }: { repos: ConnectedRepo[] }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Connected Repositories
        </h2>
        {repos.length > 0 && (
          <Badge variant="secondary" className="tabular-nums">
            {repos.length}
          </Badge>
        )}
      </div>

      {repos.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="mx-auto size-14 rounded-full bg-muted flex items-center justify-center">
              <FolderGit2 className="size-7 text-muted-foreground" />
            </div>
            <p className="mt-4 font-medium">No connected repositories found.</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              Connect your GitHub repositories to start getting AI-powered code
              reviews on your pull requests.
            </p>
            <Button asChild className="mt-6">
              <Link href="/repos?add=1">
                <Plus className="size-4" />
                Add your first repository
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {repos.map((repo) => (
            <ConnectedRepoCard key={repo.id} repo={repo} />
          ))}
        </div>
      )}
    </div>
  );
}
