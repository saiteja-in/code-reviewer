"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import GithubSVG from "@/components/svgs/GithubSVG";
import { Loader } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { GITHUB_OAUTH_SCOPES } from "@/lib/auth-shared";
import { toast } from "sonner";

export default function ConnectGithubForm() {
  const [pending, startTransition] = useTransition();

  function connectGithub() {
    startTransition(async () => {
      await authClient.linkSocial({
        provider: "github",
        scopes: GITHUB_OAUTH_SCOPES,
        callbackURL: "/repos",
        fetchOptions: {
          onError: () => {
            toast.error(
              "Could not connect GitHub. It may already be linked to another account.",
            );
          },
        },
      });
    });
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center">
        <CardTitle className="text-xl mb-1">
          Connect your GitHub account
        </CardTitle>
        <CardDescription>
          AI Code Review needs access to your GitHub repositories to review your
          pull requests. Connect your account to continue.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Button onClick={connectGithub} disabled={pending} className="w-full">
          {pending ? (
            <>
              <Loader className="size-4 animate-spin" />
              <span>Connecting...</span>
            </>
          ) : (
            <>
              <GithubSVG />
              Connect GitHub
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
