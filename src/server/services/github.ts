import { db } from '@/server/db'

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
