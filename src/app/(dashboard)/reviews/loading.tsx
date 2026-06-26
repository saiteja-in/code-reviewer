import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
	return (
		<div className="space-y-8">
			<div className="flex items-start justify-between gap-4">
				<div className="space-y-2">
					<Skeleton className="h-7 w-40" />
					<Skeleton className="h-4 w-56" />
				</div>
				<Skeleton className="h-7 w-28" />
			</div>

			<div className="flex flex-wrap gap-2 p-1 bg-muted/50 rounded-lg w-fit">
				<Skeleton className="h-8 w-12 rounded-md" />
				<Skeleton className="h-8 w-24 rounded-md" />
				<Skeleton className="h-8 w-24 rounded-md" />
				<Skeleton className="h-8 w-20 rounded-md" />
				<Skeleton className="h-8 w-20 rounded-md" />
			</div>

			<div className="space-y-3">
				{Array.from({ length: 4 }).map((_, index) => (
					<div
						key={index}
						className="rounded-lg border border-border/60 bg-card p-4"
					>
						<div className="flex items-start justify-between gap-4">
							<div className="flex items-start gap-4 min-w-0 flex-1">
								<Skeleton className="mt-1 size-8 rounded-lg shrink-0" />
								<div className="min-w-0 flex-1 space-y-3">
									<div className="flex items-center gap-2 flex-wrap">
										<Skeleton className="h-5 w-56" />
										<Skeleton className="h-5 w-20 rounded-full" />
									</div>
									<Skeleton className="h-4 w-72 max-w-full" />
									<Skeleton className="h-4 w-40" />
									<Skeleton className="h-4 w-96 max-w-full" />
								</div>
							</div>
							<div className="flex items-center gap-2 shrink-0">
								<Skeleton className="size-8 rounded-md" />
								<Skeleton className="h-6 w-16 rounded-md" />
							</div>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
