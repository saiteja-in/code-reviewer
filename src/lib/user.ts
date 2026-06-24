import { headers } from "next/headers";
import { auth } from "@/server/auth";
import { db } from "@/server/db";

export const currentUser = async () => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return session?.user;
};

/**
 * The user's linked GitHub account row (holds the `repo`-scoped access token),
 * or null if they have not linked GitHub yet. `providerId` is literally
 * "github" — matching the `socialProviders.github` key.
 */
export const getGithubAccount = async (userId: string) =>
  db.account.findFirst({ where: { userId, providerId: "github" } });

/** Whether the user has linked a GitHub account (gate for the dashboard). */
export const isGithubLinked = async (userId: string) =>
  (await getGithubAccount(userId)) !== null;
