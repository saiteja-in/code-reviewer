import Navbar from "@/components/Navbar";
import { auth } from "@/server/auth";
import { isGithubLinked } from "@/lib/user";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login");
  }
  // The product reviews GitHub repos, so dashboard access requires a linked
  // GitHub account (which also provides the repo-scoped access token).
  if (!(await isGithubLinked(session.user.id))) {
    redirect("/connect-github");
  }
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
