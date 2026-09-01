import type { Metadata } from "next";
import { currentUser } from "@/lib/user";
import { createMetadata } from "@/lib/metadata";
import { redirect } from "next/navigation";
import { LoginForm } from "./_components/LoginForm";

export const metadata: Metadata = createMetadata({
  title: "Sign in",
  description: "Sign in to AI Code Review with GitHub or email.",
  path: "/login",
  noIndex: true,
});

export default async function LoginPage() {
  const user = await currentUser();

  if (user) {
    return redirect("/");
  }

  return <LoginForm />;
}
