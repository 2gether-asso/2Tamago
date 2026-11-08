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
# Public address of the API when it is on another origin (for example
# https://api.example.org). Empty: same origin, through the /api proxy below.
ARG VITE_API_URL=
ENV VITE_API_URL=${VITE_API_URL}
COPY shared/core shared/core
COPY web web
RUN pnpm --filter @2tamago/web build

# nginx serves the single-page app over plain HTTP (a reverse proxy handles
# HTTPS) and proxies /api to the API service.
# Runtime setting: API_UPSTREAM (host:port of the API, default api:3000).
FROM nginx:1-alpine AS prod
LABEL org.opencontainers.image.source="https://github.com/2gether-asso/2tamago" \
      org.opencontainers.image.description="2Tamago web app"
ENV API_UPSTREAM=api:3000 NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
COPY web/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /repo/web/build /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
