FROM node:20-bookworm-slim

RUN corepack enable pnpm

WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY prisma ./prisma
COPY workers/indexer ./workers/indexer

RUN pnpm install --filter @aicodereview/indexer-worker...

# Single Prisma generate at repo root (avoids duplicate generate / EPERM)
RUN pnpm exec prisma generate --schema=prisma/schema.prisma

WORKDIR /app/workers/indexer

ENV NODE_ENV=production
ENV INDEXER_WORKSPACE_DIR=/tmp/repos

RUN mkdir -p /tmp/repos

# tree-sitter native bindings are built during pnpm install above

CMD ["pnpm", "start"]
