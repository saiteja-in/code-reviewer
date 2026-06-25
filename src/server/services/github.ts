import { db } from '@/server/db'

export interface GitHubPullRequestFile {
  sha: string;
  filename: string;
  status:
    | "added"
    | "removed"
    | "modified"
    | "renamed"
    | "copied"
    | "changed"
    | "unchanged";
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  previous_filename?: string;
}

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


export interface PullRequestSummary {
  id: number;
  number: number;
  title: string;
  state: "open" | "closed";
  draft: boolean;
  htmlUrl: string;
  author: { login: string; avatarUrl: string };
  headRef: string;
  baseRef: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
}

interface GraphQLPullRequestNode {
  databaseId: number;
  number: number;
  title: string;
  state: "OPEN" | "CLOSED" | "MERGED";
  isDraft: boolean;
  url: string;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  author: { login: string; avatarUrl: string } | null;
  headRefName: string;
  baseRefName: string;
}

interface GraphQLPullRequestsResponse {
  data?: {
    repository?: {
      pullRequests?: { nodes: GraphQLPullRequestNode[] };
    } | null;
  };
  errors?: { message: string }[];
}

const PULL_REQUESTS_QUERY = `
  query ($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      pullRequests(first: 30, orderBy: { field: UPDATED_AT, direction: DESC }) {
        nodes {
          databaseId
          number
          title
          state
          isDraft
          url
          createdAt
          updatedAt
          mergedAt
          additions
          deletions
          changedFiles
          author {
            login
            avatarUrl
          }
          headRefName
          baseRefName
        }
      }
    }
  }
`;

// One GraphQL request that returns every PR's additions/deletions/changedFiles,
// avoiding the REST list endpoint's per-PR (N+1) enrichment calls. The `repo`
// OAuth scope already covers the GraphQL endpoint.
export async function fetchPullRequestsGraphQL(
  accessToken: string,
  owner: string,
  repo: string,
): Promise<PullRequestSummary[]> {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: PULL_REQUESTS_QUERY,
      variables: { owner, name: repo },
    }),
  });

  if (!response.ok) {
    throw new Error(`GitHub GraphQL error: ${response.status}`);
  }

  // GraphQL returns HTTP 200 even on query errors — surface them explicitly.
  const json = (await response.json()) as GraphQLPullRequestsResponse;
  if (json.errors?.length) {
    throw new Error(json.errors[0]?.message ?? "GitHub GraphQL error");
  }

  const nodes = json.data?.repository?.pullRequests?.nodes ?? [];

  return nodes.map((node) => ({
    id: node.databaseId,
    number: node.number,
    title: node.title,
    // GraphQL state is OPEN | CLOSED | MERGED; merged maps to "closed" with
    // mergedAt set, which the card uses to show the merge icon.
    state: node.state === "OPEN" ? "open" : "closed",
    draft: node.isDraft,
    htmlUrl: node.url,
    author: {
      login: node.author?.login ?? "ghost",
      avatarUrl: node.author?.avatarUrl ?? "",
    },
    headRef: node.headRefName,
    baseRef: node.baseRefName,
    additions: node.additions,
    deletions: node.deletions,
    changedFiles: node.changedFiles,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    mergedAt: node.mergedAt,
  }));
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

export async function fetchPullRequestFiles(
  accessToken: string,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<GitHubPullRequestFile[]> {
  const files: GitHubPullRequestFile[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=${perPage}&page=${page}`,
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

    const data = (await response.json()) as GitHubPullRequestFile[];
    files.push(...data);

    if (data.length < perPage) break;
    page++;
  }

  return files;
}