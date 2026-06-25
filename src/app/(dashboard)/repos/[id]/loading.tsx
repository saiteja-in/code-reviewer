import { Skeleton } from "@/components/ui/skeleton";
import { PrListSkeleton } from "./_components/pr-list-skeleton";

export default function Loading() {
  return (
    <div className="space-y-8">
      <div className="flex items-start gap-4">
        <Skeleton className="size-9 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <PrListSkeleton />
    </div>
  );
}
