import { createAuthClient } from "better-auth/react";
import {
  emailOTPClient,
  inferAdditionalFields,
} from "better-auth/client/plugins";
import type { auth } from "@/server/auth";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_URL,
  // `inferAdditionalFields<typeof auth>()` makes the server-defined extra user
  // fields (e.g. `githubUsername`) type-safe on the client session. The import
  // of `auth` is type-only, so no server code is bundled into the client.
  plugins: [emailOTPClient(), inferAdditionalFields<typeof auth>()],
});

export const { signIn, signUp, signOut, useSession, getSession, linkSocial } =
  authClient;
