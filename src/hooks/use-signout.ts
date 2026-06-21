"use client";

import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";

export function useSignOut() {
  const handleSignout = async function signOut() {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          toast.success("Signed out successfully");
          window.location.href = "/";
        },
        onError: () => {
          toast.error("Failed to sign out");
        },
      },
    });
  };

  return handleSignout;
}
