import { HealthCheck } from "@/components/health-check";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center gap-8 py-16">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">
          Welcome to AI Code Review
        </h1>
        <p className="text-lg text-muted-foreground max-w-md">
          Start reviewing your code with AI-powered insights on your GitHub
          repositories.
        </p>
      </div>
      <div className="flex gap-4">
        <Button asChild>
          <Link href="/login">Get Started</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/repos">View Repositories</Link>
        </Button>
      </div>
      {/* <HealthCheck />    */}
    </div>
  );
}
