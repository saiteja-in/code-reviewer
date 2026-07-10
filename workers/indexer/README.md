# Indexer worker (Steps 12–18)

Heavy indexing (tree-sitter, SCIP, Neo4j writes) runs here — not in the Next.js serverless app.

## Local (without Docker)

```powershell
cd workers/indexer
pnpm install
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/codereviewer"
$env:NEO4J_URI="bolt://localhost:7687"
$env:NEO4J_USER="neo4j"
$env:NEO4J_PASSWORD="password123"
pnpm start
```

## Docker (from repo root)

```powershell
docker compose build indexer-worker
docker compose up indexer-worker
```

Expect logs: `indexer-worker: ready`
