export const siteConfig = {
  name: "AI Code Review",
  description:
    "AI pull request reviewer for GitHub. Install the App, open a PR, and get summaries, risk scores, and inline comments posted as a Check Run.",
  tagline: "Reviews land on the PR.",
  /** Primary `<title>` for the homepage — tuned for Google queries. */
  seoTitle: "AI Code Review | GitHub Pull Request Reviewer",
  /** Meta description for the homepage — ~155 characters. */
  seoDescription:
    "AI Code Review is a GitHub pull request reviewer. Install the GitHub App to get automated PR reviews with summaries, risk scores, inline comments, and check runs.",
  keywords: [
    "AI code review",
    "GitHub pull request reviewer",
    "GitHub App",
    "automated code review",
    "PR review bot",
    "GitHub check run",
    "inline PR comments",
    "AI PR review",
  ],
} as const;

/** Canonical public site URL for metadata, sitemap, and auth client. */
export function getSiteUrl(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_URL?.trim();

  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  }

  return "http://localhost:3000";
}

export function getGoogleSiteVerification(): string | undefined {
  return process.env.GOOGLE_SITE_VERIFICATION?.trim() || undefined;
}
