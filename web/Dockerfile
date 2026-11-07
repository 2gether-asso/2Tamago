# syntax=docker/dockerfile:1
# Build context: the repository root (the web app depends on shared/core and on
# the workspace lockfile). Files sent to the build are filtered by
# web/Dockerfile.dockerignore.
#   docker build -f web/Dockerfile -t 2tamago-web .
ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY shared/core/package.json shared/core/
COPY web/package.json web/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @2tamago/web...

FROM deps AS build
COPY shared/core shared/core
COPY web web
RUN pnpm --filter @2tamago/web build

# Caddy serves the single-page app and proxies /api to the API service.
# Runtime settings: SITE_ADDRESS (domain for automatic HTTPS, or :80) and
# API_UPSTREAM (host:port of the API, default api:3000).
FROM caddy:2-alpine AS prod
LABEL org.opencontainers.image.source="https://github.com/2gether-asso/2tamago" \
      org.opencontainers.image.description="2Tamago web app"
COPY web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/web/build /srv
EXPOSE 80 443
# The admin endpoint answers whatever SITE_ADDRESS is (a domain redirects :80 to HTTPS).
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:2019/config/ >/dev/null || exit 1
