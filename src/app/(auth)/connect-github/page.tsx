import type { Metadata } from "next";
import { auth } from "@/server/auth";
import { isGithubLinked } from "@/lib/user";
import { createMetadata } from "@/lib/metadata";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import ConnectGithubForm from "./_components/ConnectGithubForm";

export const metadata: Metadata = createMetadata({
  title: "Connect GitHub",
  description: "Link your GitHub account to import repositories and run reviews.",
  path: "/connect-github",
  noIndex: true,
});

export default async function ConnectGithubPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    redirect("/login");
  }

  // Already linked — nothing to do here; send them into the app.
  if (await isGithubLinked(session.user.id)) {
    redirect("/repos");
  }

  return <ConnectGithubForm />;
}
