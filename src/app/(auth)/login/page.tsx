import { currentUser } from "@/lib/user";
import { redirect } from "next/navigation";
import { LoginForm } from "./_components/LoginForm";

export default async function LoginPage() {
  const user = await currentUser();

  if (user) {
    return redirect("/");
  }

  return <LoginForm />;
}
