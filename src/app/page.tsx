import { HealthCheck } from "@/components/health-check";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div>
        <h1>welcome to ai code reviewer.</h1>
        <p>start reviewing your code now.</p>

      </div>
      <div className="flex gap-4">
        <Button asChild>
          <Link href="/login">Login</Link>
        </Button>
        <Button asChild>
          <Link href="/login">Logout</Link>
        </Button>
      </div>
      <HealthCheck/>
    </div>
  );
}
