FROM node:22-bookworm-slim

RUN corepack enable pnpm

WORKDIR /app

COPY package.json ./
RUN pnpm install --no-frozen-lockfile

COPY tsconfig.json ./
COPY src ./src

ENV NODE_ENV=production
ENV INDEXER_WORKSPACE_DIR=/tmp/repos

RUN mkdir -p /tmp/repos

CMD ["pnpm", "start"]
