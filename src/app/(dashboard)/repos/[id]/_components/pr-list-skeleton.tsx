import { Skeleton } from "@/components/ui/skeleton";

/** Tab bar + PR card skeletons, shared by loading.tsx and the Suspense fallback. */
export function PrListSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-10 w-64" />
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
