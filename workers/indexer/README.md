# Indexer worker

Background worker for repo indexing (tree-sitter graph enrichment, Neo4j). Runs via **Inngest Connect**, separate from the Next.js app.

## Layout

```
workers/indexer/src/
  config/env.ts       # env loading + validation
  db/client.ts        # Prisma singleton
  lib/logger.ts       # structured console logging
  services/health.ts  # startup Postgres + Neo4j checks
  inngest/
    client.ts
    connect.ts        # Inngest Connect bootstrap
    events.ts         # event type definitions
    functions/
      index-repo.ts
  indexer/
    parse.ts          # tree-sitter + tags.scm (Step 15+)
    graph-build.ts    # fetch TS files + MERGE structural graph (Step 16+)
    graph-enrich.ts   # IMPORTS + heuristic CALLS (Step 17)
    chunk.ts          # symbol-aware chunking (Step 18)
    embed-index.ts    # Voyage embed + FileChunk upsert (Step 18)
    chunk-store.ts
    imports.ts
    call-resolver.ts
    graph-write.ts
    github-files.ts
    types.ts
  services/
    github-app.ts     # installation Octokit for file fetch
  db/
    neo4j.ts
scripts/
  build-graph-fixture.ts
  build-embed-fixture.ts
  main.ts             # entrypoint
tags/
  typescript.scm      # from tree-sitter-typescript (+ extensions)
fixtures/
  sample-service.ts
  user-controller.ts
```

## Graph enrichment (Step 17)

After structural nodes (`CONTAINS`, `DECLARES`), the indexer adds:

- **IMPORTS** — `File → File` for resolved relative imports (`./sample-service` → `fixtures/sample-service.ts`)
- **CALLS** — `Method → Method` with `line` and `confidence` (`high` | `medium` | `low`)

Resolution is heuristic (no clone, no SCIP): same-class method calls, import binding match, or method-name match in imported files.

## Incremental indexing (Step 20)

When a push webhook includes `before` → `baseCommit`, the worker compares commits and re-indexes only changed TypeScript paths (Neo4j path purge + FileChunk upsert). Large diffs fall back to full re-index (`INDEX_INCREMENTAL_MAX_FILES`, default 80).

## Embeddings (Step 18)

After graph indexing, `index-repo` chunks each TypeScript file by tree-sitter symbol (Class, Interface, Method), embeds with **Voyage `voyage-code-3`** (1024-d), and upserts rows into Postgres `FileChunk` (pgvector).

Requires `VOYAGE_API_KEY` in repo root `.env` or `workers/indexer/.env`.

```powershell
cd workers/indexer
pnpm embed:fixture
```

Verify:

```sql
SELECT COUNT(*) FROM "FileChunk" WHERE "repositoryId" = 'YOUR_REPOSITORY_CUID';
SELECT path, symbol, "startLine", "endLine" FROM "FileChunk" WHERE "repositoryId" = 'YOUR_REPOSITORY_CUID' LIMIT 10;
```

## Prerequisites

Generate Prisma client **once from the repo root** (not inside the worker):

```powershell
cd D:\PROJECTS\aicodereview
pnpm prisma generate
```

> **Do not** add `postinstall` prisma generate on the worker package — it races with the root install on Windows and causes `EPERM` rename errors.

If `pnpm install` fails with EPERM: close `pnpm dev`, the indexer worker, and Prisma Studio, then retry.

## Local development

Terminal 1 — Next.js + Inngest dev (`review-pr`):

```powershell
pnpm dev
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
```

Terminal 2 — indexer worker:

```powershell
cd workers/indexer
copy .env.example .env
pnpm start
```

Or from repo root:

```powershell
pnpm --filter @aicodereview/indexer-worker start
```

## Docker

Inngest dev must run on the **host** (`localhost:8288`):

```powershell
docker compose build indexer-worker
docker compose up -d indexer-worker
docker compose logs -f indexer-worker
```

## Verify (Step 13)

1. Inngest UI — `review-pr` + `index-repo` under app `tejacodereview`
2. `pnpm send:index-event -- YOUR_REPOSITORY_CUID`
3. `Repository.indexStatus` → `ready`
