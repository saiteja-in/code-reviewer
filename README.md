# AI Code Review

An AI-powered GitHub pull request reviewer. Sign in, connect repositories, and get durable Claude reviews — a summary, risk score (0–100), and inline comments — in the dashboard and posted back to GitHub.

Reviews run as background jobs (Inngest) and can be triggered from the UI or automatically via a GitHub webhook when a PR is opened, updated, or reopened.

## Features

- **Auth** — GitHub OAuth and email OTP (Resend), with account linking so email users can connect GitHub
- **Repos** — Import and connect GitHub repositories you have access to
- **PR browsing** — List pull requests, view file diffs, and open PR detail pages
- **Manual reviews** — Trigger a review from the PR page
- **Automatic reviews** — GitHub `pull_request` webhook on `opened`, `synchronize`, and `reopened` (skips drafts)
- **Claude analysis** — Structured output via Anthropic (`claude-sonnet-4-6`): summary, risk score, categorized inline comments
- **GitHub post-back** — Posts a PR review (with inline comments when mappable) and a commit status using the user’s OAuth token
- **Dashboard** — Live status polling for pending/processing/completed/failed reviews

## Tech stack

| Area | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router), React 19 |
| Language | TypeScript |
| API | tRPC v11 + TanStack React Query + superjson |
| Auth | better-auth (GitHub OAuth + email OTP) |
| Database | PostgreSQL + Prisma 6 |
| Jobs | Inngest v4 |
| AI | Anthropic Claude Sonnet 4.6 |
| Email | Resend |
| UI | Tailwind CSS v4, shadcn/ui, lucide-react, sonner |
| Package manager | pnpm |

## Architecture

```mermaid
flowchart LR
  trigger[UI_or_webhook] --> pending[Review_PENDING]
  pending --> inngest[Inngest_review-pr]
  inngest --> claude[Claude_reviewCode]
  claude --> db[(Postgres)]
  claude --> github[PR_review_and_status]
  db --> ui[Dashboard]
```

1. UI (`review.trigger`) or `POST /api/webhooks/github` creates a `Review` in `PENDING` and sends `review/pr.requested`.
2. Inngest function `review-pr` marks it `PROCESSING`, loads the PR and files with the user’s GitHub token, calls Claude, then saves results.
3. On success it posts a GitHub PR review + commit status, then marks the review `COMPLETED` (or `FAILED` on error / `onFailure`).

GitHub API access uses the connected user’s OAuth token (`repo` scope), not a GitHub App.

## Project structure

```
src/
├── app/
│   ├── (public)/                 # Marketing home
│   ├── (auth)/                   # login, verify-request, connect-github
│   ├── (dashboard)/              # Authed: repos, PRs, reviews
│   └── api/
│       ├── auth/[...all]/        # better-auth
│       ├── trpc/[trpc]/          # tRPC
│       ├── inngest/              # Inngest serve endpoint
│       └── webhooks/github/      # PR webhooks
├── components/                   # Shared UI (navbar, diff viewer, review result, shadcn)
├── lib/                          # tRPC helpers, auth client, Resend, utils
└── server/
    ├── api/                      # tRPC routers: health, repository, pullRequest, review
    ├── auth/                     # better-auth config
    ├── db/                       # Prisma client
    ├── inngest/                  # client + review-pr function
    └── services/                 # github, ai, diff-line-mapper, review-format
prisma/
└── schema.prisma                 # User, Session, Account, Verification, Repository, Review
```

Pages are mostly **Server Components**. Interactive pieces live in sibling `_components/` as client islands, often seeded with `initialData` from the server.

## Getting started

### Prerequisites

- Node.js 20+ and **pnpm**
- A PostgreSQL database (e.g. Neon)
- GitHub OAuth App (callback aligned with better-auth)
- Resend API key (email OTP)
- Anthropic API key
- [Inngest CLI](https://www.inngest.com/docs/local-development) for local jobs

### Setup

```bash
pnpm install
pnpm prisma generate
pnpm prisma db push

# Create a .env in the project root (see below), then:
pnpm dev
# In another terminal — required for background reviews:
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
```

App: [http://localhost:3000](http://localhost:3000) · Inngest Dev UI: [http://localhost:8288](http://localhost:8288)

Inngest v4 defaults to Cloud mode. For local development set `INNGEST_DEV=1` or `/api/inngest` will fail. In production use `INNGEST_SIGNING_KEY` (and typically `INNGEST_EVENT_KEY`) instead.

### Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Postgres connection string (Prisma) |
| `BETTER_AUTH_SECRET` | Yes | Secret for better-auth sessions |
| `BETTER_AUTH_URL` | Yes | App origin, e.g. `http://localhost:3000` |
| `NEXT_PUBLIC_APP_URL` | Yes | Public app URL (auth client, review links) |
| `GITHUB_CLIENT_ID` | Yes | GitHub OAuth App client ID |
| `GITHUB_CLIENT_SECRET` | Yes | GitHub OAuth App client secret |
| `RESEND_API_KEY` | Yes | Email OTP delivery |
| `RESEND_FROM_EMAIL` | Yes | Verified sender address |
| `ANTHROPIC_API_KEY` | Yes | Claude reviews fail without it |
| `INNGEST_DEV` | Local | Set to `1` for local Inngest |
| `INNGEST_SIGNING_KEY` | Prod | Replaces `INNGEST_DEV` in production |
| `GITHUB_WEBHOOK_SECRET` | Prod / webhooks | HMAC secret; optional in local (verification skipped with a warning) |
| `NODE_ENV` | Optional | `development` / `production` |

Example `.env` (placeholders only):

```env
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000
BETTER_AUTH_SECRET=generate-a-long-random-string
BETTER_AUTH_URL=http://localhost:3000
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
RESEND_API_KEY=
RESEND_FROM_EMAIL=
ANTHROPIC_API_KEY=
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DB
INNGEST_DEV=1
GITHUB_WEBHOOK_SECRET=
```

GitHub OAuth scopes requested: `read:user`, `user:email`, `repo` (needed to read private PRs and post reviews/statuses).

## GitHub webhooks (local)

Repo connect does **not** auto-register webhooks. For automatic reviews locally:

1. Expose the app: `ngrok http 3000` (or similar).
2. In the GitHub repo: **Settings → Webhooks → Add webhook**
   - Payload URL: `https://YOUR_TUNNEL/api/webhooks/github`
   - Content type: `application/json`
   - Secret: same value as `GITHUB_WEBHOOK_SECRET`
   - Events: **Pull requests**

Or with the GitHub CLI:

```bash
gh api repos/OWNER/REPO/hooks \
  -f url='https://YOUR_TUNNEL/api/webhooks/github' \
  -f events='["pull_request"]' \
  -f secret='your-secret-here' \
  -f active='true' \
  -F content_type='json'
```

Keep `pnpm dev` and the Inngest CLI running so webhook-triggered jobs execute.

## App routes

| Path | Description |
| --- | --- |
| `/` | Public home |
| `/login` | Sign in (GitHub or email OTP) |
| `/verify-request` | Email OTP verification |
| `/connect-github` | Link GitHub if signed in without it |
| `/repos` | Connected repositories |
| `/repos/[id]` | Pull requests for a repo |
| `/repos/[id]/pr/[prNumber]` | PR detail, files, trigger review |
| `/reviews` | All reviews |
| `/api/auth/[...all]` | better-auth |
| `/api/trpc/[trpc]` | tRPC |
| `/api/inngest` | Inngest serve |
| `/api/webhooks/github` | GitHub webhooks |

## Data model

| Model | Purpose |
| --- | --- |
| `User` | App user; optional `githubUsername` |
| `Session` / `Account` / `Verification` | better-auth sessions, OAuth accounts, OTP tokens |
| `Repository` | Connected GitHub repo (`githubId`, `fullName`, …) |
| `Review` | PR review job + results + GitHub post-back fields |
| `ReviewStatus` | `PENDING` \| `PROCESSING` \| `COMPLETED` \| `FAILED` |

## Scripts

```bash
pnpm dev      # Next.js dev server (:3000)
pnpm build    # Production build
pnpm start    # Run production server
pnpm lint     # ESLint
pnpm test     # Node test runner on src/server/services/*.test.ts
```

## Conventions

- Prefer **server components** for data fetching; put interactivity in `_components/` client islands.
- Server pages call tRPC in-process via `getServerApi()`; client islands use the React Query + tRPC hooks.
- For deeper architecture notes and extension guidance, see [project_context.md](project_context.md).
- Agent / Next.js version notes: [AGENTS.md](AGENTS.md).
