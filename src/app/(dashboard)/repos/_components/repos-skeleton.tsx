import { Skeleton } from "@/components/ui/skeleton";

/** Connected-repositories list skeleton, shared by loading.tsx. */
export function ReposSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-4 w-40" />
      <div className="grid gap-3 sm:grid-cols-2">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
