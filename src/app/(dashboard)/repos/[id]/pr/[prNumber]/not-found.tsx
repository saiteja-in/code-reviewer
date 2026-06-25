import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, XCircle } from "lucide-react";

export default function PullRequestNotFound() {
  return (
    <Card>
      <CardContent className="py-16 text-center">
        <div className="mx-auto size-12 rounded-full bg-destructive/10 flex items-center justify-center">
          <XCircle className="size-6 text-destructive" />
        </div>
        <p className="mt-4 font-medium text-destructive">
          Pull request not found
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          This pull request may not exist or you don&apos;t have access to it.
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link href="/repos">
            <ArrowLeft className="size-4" />
            Back to repositories
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
