import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getGitHubAppInstallUrl } from "@/lib/github-app-install";
import { Bot } from "lucide-react";

export function InstallGitHubAppBanner({
  show,
}: {
  show: boolean;
}) {
  const installUrl = getGitHubAppInstallUrl();

  if (!show || !installUrl) {
    return null;
  }

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="size-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
          <Bot className="size-4 text-primary" />
        </div>
        <div>
          <p className="font-medium text-sm">Install the GitHub App</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Automatic PR reviews and bot check runs require the App to be
            installed on your repositories. Connect repos here first, then
            install the App and select the same repos.
          </p>
        </div>
      </div>
      <Button asChild className="shrink-0">
        <Link href={installUrl} target="_blank" rel="noopener noreferrer">
          Install GitHub App
        </Link>
      </Button>
    </div>
  );
}
