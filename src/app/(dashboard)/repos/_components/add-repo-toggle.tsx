import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";

/**
 * Server component. The import panel is driven by the `?add=1` search param,
 * so this toggle is just a styled link — no client state needed.
 */
export function AddRepoToggle({ open }: { open: boolean }) {
  if (open) {
    return (
      <Button asChild variant="outline">
        <Link href="/repos">
          <X className="size-4" />
          Cancel
        </Link>
      </Button>
    );
  }

  return (
    <Button asChild>
      <Link href="/repos?add=1">
        <Plus className="size-4" />
        Add Repository
      </Link>
    </Button>
  );
}
