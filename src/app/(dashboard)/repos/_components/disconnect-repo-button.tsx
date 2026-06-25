"use client";

import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2 } from "lucide-react";

/**
 * Client island for the per-card disconnect action. Lives inside the
 * server-rendered card's `.group`, so the hover-reveal still works. On success
 * it calls `router.refresh()` to revalidate the server-rendered list.
 */
export function DisconnectRepoButton({
  repoId,
  repoName,
}: {
  repoId: string;
  repoName: string;
}) {
  const router = useRouter();
  const disconnect = trpc.repository.disconnect.useMutation({
    onSuccess: () => router.refresh(),
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={disconnect.isPending}
          className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Disconnect Repository</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to disconnect{" "}
            <span className="font-medium text-foreground">{repoName}</span>? This
            will remove all review history for this repository.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => disconnect.mutate({ id: repoId })}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Disconnect
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
