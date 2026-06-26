"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { XCircle } from "lucide-react";

export default function ReviewsError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Card className="border-destructive/50">
      <CardContent className="py-16 text-center">
        <div className="mx-auto size-12 rounded-full bg-destructive/10 flex items-center justify-center">
          <XCircle className="size-6 text-destructive" />
        </div>
        <p className="mt-4 font-medium text-destructive">
          Failed to load reviews.
        </p>
        <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
        <Button
          variant="outline"
          className="mt-6"
          onClick={() => unstable_retry()}
        >
          Try again
        </Button>
      </CardContent>
    </Card>
  );
}
