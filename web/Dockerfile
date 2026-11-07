# Build from the repository root: docker build -f web/Dockerfile .
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY shared/core/package.json shared/core/
COPY web/package.json web/
RUN pnpm install --frozen-lockfile --filter @2tamago/web...
COPY shared/core shared/core
COPY web web
RUN pnpm --filter @2tamago/web build

# Caddy serves the single-page app and proxies /api to the API container.
FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/web/build /srv
