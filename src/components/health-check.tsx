"use client";

import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export function HealthCheck() {
  const { data, isLoading, error } = trpc.health.useQuery();

  if (isLoading) {
    return <Skeleton className="h-6 w-24" />;
  }

  if (error) {
    return <Badge variant="destructive">API Error</Badge>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="secondary">
        API: {data?.status} {data?.timestamps}
      </Badge>
      {data?.neo4j?.status === "ok" ? (
        <Badge variant="secondary">Neo4j: ok</Badge>
      ) : data?.neo4j ? (
        <Badge variant="destructive" title={data.neo4j.error ?? undefined}>
          Neo4j: {data.neo4j.configured ? "unreachable" : "not configured"}
        </Badge>
      ) : null}
    </div>
  );
}
