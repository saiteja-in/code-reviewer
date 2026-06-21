import { currentUser } from "@/lib/user";
import NavbarClient from "@/components/navbar-client";

export default async function Navbar() {
  const user = await currentUser();

  return <NavbarClient user={user || null} />;
}
