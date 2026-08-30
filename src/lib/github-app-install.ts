/** Public GitHub App install URL (requires NEXT_PUBLIC_GITHUB_APP_SLUG). */
export function getGitHubAppInstallUrl(): string | null {
  const slug = process.env.NEXT_PUBLIC_GITHUB_APP_SLUG?.trim();
  if (!slug) return null;
  return `https://github.com/apps/${slug}/installations/new`;
}
