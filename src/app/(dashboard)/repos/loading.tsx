import { Skeleton } from "@/components/ui/skeleton";
import { ReposSkeleton } from "./_components/repos-skeleton";

export default function Loading() {
  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-7 w-32" />
      </div>
      <ReposSkeleton />
    </div>
  );
}
