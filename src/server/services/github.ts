import { db } from '@/server/db'

export interface GitHubUser {
  login: string;
  avatar_url: string;
}

export interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  state: "open" | "closed";
  html_url: string;
  user: GitHubUser;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  draft: boolean;
  head: {
    ref: string;
    sha: string;
  };
  base: {
    ref: string;
  };
  // Only returned by the single-PR endpoint (fetchPullRequest), not the list
  // endpoint — optional so the list view can skip the per-PR enrichment call.
  additions?: number;
  deletions?: number;
  changed_files?: number;
}

export interface GitHubRepo {
    id: number;
    name: string;
    full_name: string;
    private: boolean;
    html_url: string;
    description: string | null;
    language: string | null;
    stargazers_count: number;
    updated_at: string;
}


export async function getGitHubAccessToken(userId: string): Promise<string | null> {
    const account = await db.account.findFirst({
        where: {
            userId,
            providerId: "github",
        },
        select: {
            accessToken: true,
        }
    })
    return account?.accessToken ?? null;
}

export async function fetchGitHubRepos(
    accessToken: string,
): Promise<GitHubRepo[]> {
    const repos: GitHubRepo[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
        const response = await fetch(
            `https://api.github.com/user/repos?per_page=${perPage}&page=${page}&sort=updated`,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    Accept: "application/vnd.github.v3+json",
                },
            },
        );

        if (!response.ok) {
            throw new Error(`Failed to fetch GitHub repos: ${response.status}`);
        }

        const data = (await response.json()) as GitHubRepo[];
        repos.push(...data);
        if (data.length < perPage) break;
        page++;
    }

    return repos;
}


export async function fetchPullRequests(
  accessToken: string,
  owner: string,
  repo: string,
  state: "open" | "closed" | "all" = "open",
): Promise<GitHubPullRequest[]> {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls?state=${state}&per_page=30&sort=updated&direction=desc`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`);
  }

  // Single request. The list endpoint returns everything the PR list view
  // needs except additions/deletions/changed_files (those require a per-PR
  // call and are shown on the PR detail page via fetchPullRequest instead).
  return (await response.json()) as GitHubPullRequest[];
}

export async function fetchPullRequest(
  accessToken: string,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<GitHubPullRequest> {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`);
  }

  return (await response.json()) as GitHubPullRequest;
}
