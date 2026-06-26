# AI Code Review — Project Context (for LLMs & new contributors)

> A complete snapshot of the **code-reviewer** repo: what it does, what's built, the tech, the code patterns, the data flows, and the conventions to follow when extending it. Feed this file to an LLM as grounding context. Pair it with `docs/roadmap/` for what to build next.

---

## 1. What this project is

An **AI-powered GitHub code reviewer**. A user signs in, connects GitHub repositories, and the app reviews pull requests with an LLM (Claude). A review produces a **summary**, a **risk score (0–100)**, and **inline comments** (file, line, severity, category, message, optional fix). Reviews run as **durable background jobs** and are triggered either manually from the UI or automatically by a **GitHub webhook** when a PR opens/updates. Results show in a dashboard with live status.

**Status:** core loop works end to end (connect → trigger/webhook → background job → Claude review → dashboard). The main thing not yet done: posting the review **back into the GitHub PR** (see `docs/roadmap/phase-1`).

---

## 2. Tech stack

| Area | Choice |
|---|---|
| Framework | **Next.js 16.2.7** (App Router, React 19.2) |
| Language | TypeScript (strict) |
| API | **tRPC v11** (+ TanStack React Query v5, superjson) |
| Auth | **better-auth 1.6.x** — GitHub OAuth + email OTP (via Resend) |
| DB / ORM | **PostgreSQL (Neon)** + **Prisma 6** |
| Background jobs | **Inngest v4** (durable step functions) |
| AI | **@anthropic-ai/sdk** — Claude **Sonnet 4.6** (`claude-sonnet-4-6`), structured outputs |
| UI | Tailwind v4, **shadcn/ui** (radix), lucide-react, sonner (toasts) |
| Validation | **Zod v4** |
| Email | Resend |

Scripts: `pnpm dev`, `pnpm build`, `pnpm start`, `pnpm lint`. Package manager: **pnpm**.

---

## 3. How to run (local)

```bash
pnpm install
pnpm prisma generate          # (and `prisma db push` / `migrate dev` if schema changed)
pnpm dev                       # Next.js on :3000
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest   # Inngest dev server (:8288)
```

Inngest **v4 defaults to Cloud mode** — for local dev you must set `INNGEST_DEV=1` (otherwise `/api/inngest` returns 500). In production set `INNGEST_SIGNING_KEY` instead.

---

## 4. Environment variables

Referenced by the code (set in `.env`):

| Var | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | Prisma | Neon Postgres connection string |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | better-auth | |
| `NEXT_PUBLIC_APP_URL` | tRPC client base URL, webhook URL | |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | GitHub OAuth | |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | email OTP | |
| `ANTHROPIC_API_KEY` | `ai.ts` | **required** — `reviewCode` throws without it |
| `INNGEST_DEV=1` (local) / `INNGEST_SIGNING_KEY` (prod) | Inngest | required or `/api/inngest` 500s |
| `GITHUB_WEBHOOK_SECRET` | webhook route | HMAC verification of incoming webhooks |

> Note: `.env` currently also contains `NODE_TLS_REJECT_UNAUTHORIZED="0"` (disables TLS verification globally — **insecure**, recommended to remove; may be a Neon workaround).

---

## 5. Directory structure (annotated)

```
src/
├── app/
│   ├── (public)/              # marketing/home (no auth)
│   ├── (auth)/                # login, verify-request (email OTP), connect-github  — centered auth layout
│   │   └── <route>/_components/*  # client form islands
│   ├── (dashboard)/           # authed area; layout guards session + GitHub link
│   │   ├── repos/             # connected repos + import panel
│   │   │   ├── page.tsx        (server) + _components/*  (client islands: import-panel, disconnect-repo-button; server: connected-repos, connected-repo-card, add-repo-toggle, repos-skeleton)
│   │   │   └── [id]/           # PR list for a repo
│   │   │       ├── page.tsx (server) + loading/error/not-found
│   │   │       ├── _components/* (pull-requests-section [server, fetches], pull-requests-view [client tabs/filter], pull-request-card, refresh-pull-requests, pr-list-skeleton)
│   │   │       └── pr/[prNumber]/   # PR detail (diff + reviews)
│   │   │           ├── page.tsx (server) + loading/error/not-found
│   │   │           └── _components/* (pr-header [server], pr-files-tabs [client: Reviews+Files tabs, trigger, polling])
│   │   └── reviews/            # all reviews list
│   │       ├── page.tsx (server, seeds list) + loading/error
│   │       └── _components/reviews-list.tsx (client: filters, polling, retry)
│   ├── api/
│   │   ├── auth/[...all]/route.ts     # better-auth handler
│   │   ├── trpc/[trpc]/route.ts       # tRPC fetch adapter
│   │   ├── inngest/route.ts           # Inngest serve() endpoint
│   │   └── webhooks/github/route.ts   # GitHub webhook receiver
│   └── layout.tsx                     # root layout: TRPCProvider + Toaster + fonts
├── components/
│   ├── ui/*                   # shadcn primitives (button, card, badge, skeleton, avatar, alert-dialog, …)
│   ├── review-result.tsx      # rich review render (risk gauge, severity, comments) — CLIENT
│   ├── diff-viewer.tsx        # PR diff renderer (expand/collapse, copy) — CLIENT
│   ├── connect-github.tsx     # "connect GitHub" card (linkSocial) — CLIENT
│   ├── Navbar.tsx (server) + navbar-client.tsx (client) + UserDropdown.tsx
│   └── svgs/, themes/
├── lib/
│   ├── trpc/ (client.ts, provider.tsx, server.ts [getServerApi], index.ts)
│   ├── auth-client.ts         # better-auth react client (signIn/linkSocial/…)
│   ├── auth-shared.ts         # GITHUB_OAUTH_SCOPES constant (shared client+server)
│   ├── user.ts                # currentUser(), getGithubAccount(), isGithubLinked()
│   ├── resend.ts, utils.ts (cn, formatDate), theme-utils.ts
└── server/
    ├── api/ (root.ts, trpc.ts, routers/{repository,pull-request,review}.ts)
    ├── auth/index.ts          # better-auth config
    ├── db/index.ts            # Prisma client singleton
    ├── inngest/ (client.ts, index.ts, functions/review-pr.ts)
    └── services/ (github.ts [REST+GraphQL], ai.ts [Claude])
```

---

## 6. Architecture & code patterns

**Server-first App Router (the core pattern).** Pages are **Server Components** that fetch data on the server and render static shell + lists as HTML. Only genuinely interactive pieces are `"use client"` **islands** living in a sibling `_components/` folder. This pattern is used everywhere:

- **Server data access:** `getServerApi()` (`src/lib/trpc/server.ts`) wraps `createCaller(createTRPCContext({ headers }))` so a server component calls tRPC **in-process** (no HTTP). Example: `const repos = await (await getServerApi()).repository.list()`.
- **Seeding client islands:** server-fetched data is passed as a prop and used as React Query **`initialData`**, so first paint is server HTML and the client island can then poll/refetch without a double fetch. (Used by `reviews-list`, `pr-files-tabs`.)
- **Mutations / refresh:** client islands call tRPC mutations then `router.refresh()` (revalidate server data) or React Query `refetch()`.
- **Live status:** polling via React Query `refetchInterval` that **stops** once status is no longer `PENDING`/`PROCESSING` (reviews list 3s, PR-detail review 2s).
- **Route UX:** each data route has `loading.tsx` (skeleton) + `error.tsx` (`"use client"`, uses Next 16's `unstable_retry` prop) + `not-found.tsx` where relevant. `searchParams`/`params` are **async** (Next 16) — always `await` them.
- **tRPC:** `protectedProcedure` enforces a session and injects `ctx.user`; every query/mutation is scoped by `ctx.user.id`. Transformer is superjson.
- **Background work:** anything slow/external (GitHub calls, the Claude call) runs inside an Inngest `step.run` for durability + retries.
- **DB:** Prisma client is a global singleton (`src/server/db/index.ts`) — cached on `globalThis` in dev to survive HMR.
- **Type sharing:** UI derives types from the API via `inferRouterOutputs<AppRouter>` rather than redefining shapes.

---

## 7. Data model (Prisma — `prisma/schema.prisma`)

```prisma
model User {
  id, name, email (unique), emailVerified, image?, githubUsername?,
  createdAt, updatedAt
  sessions[], accounts[], repositories[], reviews[]
}
model Session { id, expiresAt, token (unique), ipAddress?, userAgent?, userId → User }
model Account {            // better-auth; stores the GitHub OAuth token
  id, accountId, providerId ("github" for GitHub), userId → User,
  accessToken?, refreshToken?, idToken?, scope?, password?, ...
}
model Verification { id, identifier, value, expiresAt, ... }

model Repository {
  id (cuid), userId → User, githubId (unique Int), name, fullName ("owner/repo"),
  private (bool), htmlUrl, createdAt, updatedAt
  reviews[]
}
model Review {
  id (cuid), repositoryId → Repository, userId → User,
  prNumber (Int), prTitle, prUrl,
  status: ReviewStatus (default PENDING),
  summary? (Text), riskScore? (Int), comments? (Json), error? (Text),
  createdAt, updatedAt
  @@index([repositoryId]) @@index([userId]) @@index([status])
}
enum ReviewStatus { PENDING PROCESSING COMPLETED FAILED }
```

`Review.comments` (Json) holds `ReviewComment[]` (shape below). `githubUsername` is the GitHub login, set from the verified OAuth profile (never user-typed).

---

## 8. Authentication & identity

`src/server/auth/index.ts` (better-auth):
- **GitHub OAuth** — scopes `["read:user","user:email","repo"]` (shared via `GITHUB_OAUTH_SCOPES` in `src/lib/auth-shared.ts`). `mapProfileToUser` sets `name = profile.name || profile.login` and `githubUsername = profile.login`; `image = avatar_url`.
- **Email OTP** — `emailOTP` plugin sends codes via Resend (`src/lib/resend.ts`).
- **Account linking** — `accountLinking: { enabled, trustedProviders: ["github"], updateUserInfoOnLink: true, allowDifferentEmails: true }` so an email user can link GitHub even if the emails differ, and linking copies the GitHub profile (name/image/githubUsername) onto the user.
- **`user.additionalFields.githubUsername`** with `input: false` (server-set only; not client-writable). Client typing via `inferAdditionalFields<typeof auth>()` in `auth-client.ts`.

**Access gate:** `(dashboard)/layout.tsx` redirects unauthenticated users to `/login` and **GitHub-unlinked** users to `/connect-github` (the product needs the `repo`-scoped token, which only exists after GitHub OAuth). Helpers in `src/lib/user.ts`: `currentUser()`, `getGithubAccount(userId)`, `isGithubLinked(userId)`.

The stored GitHub **access token** (in `Account.accessToken`, `providerId === "github"`) is read by `getGitHubAccessToken(userId)` and used for all GitHub API calls.

---

## 9. Feature inventory (what's built)

- Email-OTP + GitHub-OAuth sign-in; required GitHub-link gate; user dropdown; theme toggle.
- Connect/list/disconnect GitHub repos; import panel (search + multi-select) fed by a live GitHub repo list.
- Per-repo PR list (open/closed/all tabs, client-filtered) with +/− and changed-files stats via **one GraphQL query**.
- PR detail: header (title, status, branches, stats, author), **Changed Files** tab (full diff viewer with expand/collapse/copy), **Reviews** tab.
- AI review: **Run AI Review / Re-run** trigger; durable Inngest job; Claude Sonnet 4.6 structured review; live status; rich result (risk gauge, severity breakdown, summary, comment cards with suggested fixes).
- `/reviews` global list with status filters, live polling, retry on failed.
- GitHub **webhook** auto-trigger on `opened`/`synchronize`/`reopened` (HMAC-verified, skips drafts, dedups in-flight reviews).

---

## 10. End-to-end data flows

**A. Onboarding/auth:** sign in (GitHub OAuth or email OTP) → if email user, gate redirects to `/connect-github` → `linkSocial({provider:"github", scopes})` → token stored in `Account` → dashboard.

**B. Connect repos:** `/repos` → `repository.fetchFromGithub` (live GitHub list) → select → `repository.connect` (upsert `Repository` rows).

**C. PR list:** `/repos/[id]` (server) → `repository.get` (header) + `pullRequest.list` (one GitHub **GraphQL** call → PRs with stats) → client `pull-requests-view` filters open/closed/all.

**D. PR detail + diff:** `/repos/[id]/pr/[prNumber]` (server) → `pullRequest.get` (header) + seeds `review.getLatestForPR`; `pull-requests` files via `pullRequest.files` (REST, returns patches) rendered by `diff-viewer`.

**E. AI review (the key flow):**
```
UI "Run AI Review" (review.trigger)  OR  GitHub webhook (opened/sync/reopened)
   → create Review { status: PENDING }
   → inngest.send({ name: "review/pr.requested", data: { reviewId, repositoryId, prNumber, userId } })
        → Inngest fn "review-pr" (durable, retries: 2):
             step: status → PROCESSING
             step: load repository / get access token / parse owner+repo
             step: fetch PR files + PR metadata (GitHub)
             step: reviewCode(...)  → Claude Sonnet 4.6 structured output
             step: status → COMPLETED { summary, riskScore, comments }
             onFailure (after retries): status → FAILED { error }
   → UI polls review.getLatestForPR (PR page, 2s) / review.list (/reviews, 3s) while PENDING|PROCESSING
   → renders <ReviewResult /> when COMPLETED
```

**F. Webhook:** `POST /api/webhooks/github` → verify HMAC (`x-hub-signature-256` vs `GITHUB_WEBHOOK_SECRET`) → only `pull_request` events, actions `opened|synchronize|reopened`, skip drafts → find `Repository` by `githubId` → dedup (skip if a PENDING/PROCESSING review exists) → create Review + `inngest.send` (same flow E).

---

## 11. AI review pipeline (`src/server/services/ai.ts`)

- Lazy Anthropic client with key guard (`getClient()` throws if `ANTHROPIC_API_KEY` unset).
- `reviewCode(prTitle, files)`:
  - builds a diff blob from files with patches; if empty → returns a COMPLETED "no changes" result.
  - calls `client.messages.parse({ model: "claude-sonnet-4-6", max_tokens: 4096, system: SYSTEM_PROMPT, messages, output_config: { format: zodOutputFormat(ReviewResultSchema) } })` → `response.parsed_output` (throws if null).
- **Schemas (Zod):**
  ```ts
  ReviewCommentSchema = { file: string, line: number,
    severity: "critical"|"high"|"medium"|"low",
    category: "bug"|"security"|"performance"|"style"|"suggestion",
    message: string, suggestion?: string }
  ReviewResultSchema  = { summary: string, riskScore: number(0..100),
    comments: ReviewComment[] }
  ```
  (Structured outputs strips unsupported constraints like `riskScore` min/max and re-validates client-side.)

---

## 12. tRPC API reference (`src/server/api`)

Root (`root.ts`) mounts: `health` (public), `repository`, `pullRequest`, `review`. `createCaller` is exported (used by `getServerApi`).

- **repository** (`routers/repository.ts`):
  - `list` → connected repos for the user.
  - `get({ id })` → single repo (NOT_FOUND if not owned).
  - `fetchFromGithub` → live GitHub repos (via `fetchGitHubRepos`).
  - `connect({ repos:[…] })` → upsert by `githubId`.
  - `disconnect({ id })` → delete (scoped by userId).
- **pullRequest** (`routers/pull-request.ts`):
  - `list({ repositoryId })` → all PRs (one **GraphQL** call) with stats + merged `Review` status; client filters by state.
  - `get({ repositoryId, prNumber })` → single PR (REST).
  - `files({ repositoryId, prNumber })` → changed files + patches (REST).
- **review** (`routers/review.ts`):
  - `trigger({ repositoryId, prNumber })` → create Review PENDING + `inngest.send`.
  - `get({ id })`, `list({ repositoryId?, limit })`, `getLatestForPR({ repositoryId, prNumber })`.

All are `protectedProcedure` and scoped to `ctx.user.id`.

---

## 13. GitHub integration (`src/server/services/github.ts`)

- `getGitHubAccessToken(userId)` — reads `Account.accessToken` where `providerId === "github"`.
- `fetchGitHubRepos(token)` — paginated REST `/user/repos`.
- `fetchPullRequestsGraphQL(token, owner, repo)` — **one** GraphQL query returning PRs with `additions/deletions/changedFiles`, author, branches, state (OPEN/CLOSED/MERGED → mapped to open/closed + mergedAt). Avoids the REST 1+N.
- `fetchPullRequest(token, owner, repo, prNumber)` — REST single PR (includes stats + `head.sha`).
- `fetchPullRequestFiles(token, owner, repo, prNumber)` — paginated REST files (with `patch`).
- **No write helpers yet** (posting reviews/statuses is Phase 1 in the roadmap).

---

## 14. Conventions to follow when extending

- **Repo rules (`AGENTS.md`)**: before editing for a substantial task, run `pnpm dlx @tanstack/intent@latest list` and load the matching skill (`.agents/skills/*`: next, prisma, shadcn, inngest). "This is NOT the Next.js you know" — read `node_modules/next/dist/docs/` before writing route code.
- **Server vs client:** default to Server Components; add `"use client"` only for interactivity (state, effects, event handlers, polling). Put client islands in `_components/`. Never import server-only modules into client files; `src/lib/trpc/server.ts` is server-only (imports `next/headers`).
- **Data fetching:** server components use `getServerApi()`; client islands use `trpc.*.useQuery/useMutation`. Seed client queries from server data via `initialData`.
- **Inngest (v4):** triggers go **in the config** (`triggers: [{ event }]`); use `onFailure` to mark terminal failures; `NonRetriableError` for permanent errors; wrap external calls in `step.run`; add `concurrency`/`throttle` for provider rate limits. (See `.agents/skills/inngest-*`.)
- **AI:** Anthropic SDK + structured outputs (`messages.parse` + `zodOutputFormat`); model ids per the Claude skill.
- **UI (shadcn):** semantic tokens, `flex gap-*` (no `space-*`), `size-*`, `cn()`; reuse existing primitives; this repo's `Badge` only has `default/secondary/destructive/outline/ghost/link` variants (use className colors for status badges).
- **Types:** derive from `inferRouterOutputs<AppRouter>`; don't redefine API shapes.

---

## 15. What's NOT done yet (gaps) → see `docs/roadmap/`

- **Posting reviews back to GitHub** (inline comments + summary + commit status) — Phase 1.
- Auto-registering webhooks on connect — Phase 1.
- Noise/confidence gating, codebase-aware context (pgvector), per-repo `.aicodereview.yml` — Phase 2.
- In-PR chat/commands, one-click fix suggestions, incremental re-review — Phase 3.
- GitHub App (+ Check Runs gating), analytics & settings, notifications, cost/model tiering, Inngest realtime — Phase 4.
- Sensitive-info (secret/PII) detection as a blocking check — differentiator.

Detailed implementation plans for each are in `docs/roadmap/`.

---

## 16. Known issues / caveats (verify against the live code)

- **Required env**: `ANTHROPIC_API_KEY`, `INNGEST_DEV=1` (local), and `GITHUB_WEBHOOK_SECRET` must be set or reviews/webhooks won't work.
- `.env` has `NODE_TLS_REJECT_UNAUTHORIZED="0"` — insecure; recommend removing.
- There are two near-duplicate files: `repos/[id]/_components/refresh-pull-request.tsx` and `refresh-pull-requests.tsx` — one is likely dead; confirm which the page imports and delete the other.
- A few leftover `console.log`s may exist in `repos/[id]/pr/[prNumber]/page.tsx` — safe to remove.
- The PR-detail tabs island is named `pr-files-tabs.tsx` but now hosts **both** the Reviews and Changed Files tabs (the name is historical).
- Webhook signature check should guard buffer-length before `timingSafeEqual` (a malformed signature can otherwise throw a 500).

---

*Generated as living documentation. When the architecture changes, update this file and `docs/roadmap/`.*
