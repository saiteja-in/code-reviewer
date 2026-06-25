"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Re-runs the server components (including the GitHub fetch) via router.refresh().
 * The transition keeps `pending` true until the refreshed server data arrives.
 */
export function RefreshPullRequests() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => startTransition(() => router.refresh())}
      disabled={pending}
    >
      <RefreshCw className={cn("size-4", pending && "animate-spin")} />
    </Button>
  );
}
