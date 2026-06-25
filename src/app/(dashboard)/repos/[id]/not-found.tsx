import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, GitBranch } from "lucide-react";

export default function RepositoryNotFound() {
  return (
    <Card>
      <CardContent className="py-16 text-center">
        <div className="mx-auto size-12 rounded-full bg-muted flex items-center justify-center">
          <GitBranch className="size-6 text-muted-foreground" />
        </div>
        <p className="mt-4 font-medium">Repository not found</p>
        <p className="text-sm text-muted-foreground mt-1">
          This repository may have been disconnected.
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
