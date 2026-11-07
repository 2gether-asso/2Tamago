# syntax=docker/dockerfile:1
# Build context: the repository root (the API depends on shared/core and on the
# workspace lockfile). Files sent to the build are filtered by
# api/Dockerfile.dockerignore.
#   docker build -f api/Dockerfile -t 2tamago-api .
ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-alpine AS base
RUN corepack enable
WORKDIR /repo

# Dependencies only: this layer is cached until a manifest or the lockfile changes.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY shared/core/package.json shared/core/
COPY api/package.json api/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @2tamago/api...

FROM deps AS build
COPY shared/core shared/core
COPY api api
RUN pnpm --filter @2tamago/core build \
 && pnpm --filter @2tamago/api build \
 && pnpm --filter @2tamago/api deploy --prod /out

FROM node:${NODE_VERSION}-alpine AS prod
LABEL org.opencontainers.image.source="https://github.com/2gether-asso/2tamago" \
      org.opencontainers.image.description="2Tamago API"
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "dist/main.js"]
