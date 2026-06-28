/**
 * GitHub OAuth scopes requested for both sign-in (server provider config) and
 * account linking (client `linkSocial`). Kept here as a single source of truth
 * so the two flows always request the same access.
 *
 * - `read:user`  — read the user's profile (login, name, avatar).
 * - `user:email` — read the user's email addresses.
 * - `repo`       — read/write public + private repos: needed to read PR diffs
 *                  and post reviews and commit statuses.
 */
export const GITHUB_OAUTH_SCOPES = ["read:user", "user:email", "repo"];
