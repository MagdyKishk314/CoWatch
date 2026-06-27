# =============================================================================
# Cowatch — web image (React + Vite SPA → nginx static) · multi-stage SKELETON
# =============================================================================
# Purpose : Forward-looking, commented multi-stage Dockerfile for the future
#           Vite build, served as static files by nginx-unprivileged.
#           Parametrized by APP_NAME so it also builds `landing` (DEPLOYMENT §3.1).
# Status  : Planning (Phase 0 — Architecture). FORWARD-LOOKING SKELETON.
# Owner   : DevOps Engineer
# Last updated: 2026-06-27
#
# -----------------------------------------------------------------------------
# PLANNING NOTE — apps/web and apps/landing DO NOT EXIST YET. This Dockerfile
# will NOT build until the React/Vite apps + monorepo are scaffolded. It encodes
# the INTENDED build (DEPLOYMENT §2.2) so it is ready on day one of the UI phases.
#
# Build rules (DEPLOYMENT §2.1):
#   * Multi-stage; prune the app subgraph with `turbo prune`.
#   * Final stage = nginx-unprivileged (non-root by design), SPA fallback,
#     gzip/brotli, security headers, a /healthz endpoint.
#   * VITE_* values are PUBLIC and inlined at BUILD time (NEVER put secrets here).
#   * Pin base images BY DIGEST in production (node / nginx).
#
# Build context = monorepo ROOT (compose `context: ..`).
#   docker build -f docker/web.Dockerfile --build-arg APP_NAME=web     -t cowatch/web .
#   docker build -f docker/web.Dockerfile --build-arg APP_NAME=landing -t cowatch/landing .
# =============================================================================

# syntax=docker/dockerfile:1.7

# Which app in apps/* to build: web (default) or landing.
ARG APP_NAME=web

# -----------------------------------------------------------------------------
# Stage: base — shared toolchain. TODO(pin): node:22-alpine@sha256:<digest>
# -----------------------------------------------------------------------------
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /repo

# -----------------------------------------------------------------------------
# Stage: pruner — isolate the target app's subgraph (web OR landing).
# -----------------------------------------------------------------------------
FROM base AS pruner
ARG APP_NAME
COPY . .
# RUN pnpm dlx turbo prune @cowatch/${APP_NAME} --docker

# -----------------------------------------------------------------------------
# Stage: deps — install only the pruned subgraph's deps (cache-mounted store).
# -----------------------------------------------------------------------------
FROM base AS deps
# COPY --from=pruner /repo/out/json/ .
# RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
#     pnpm install --frozen-lockfile

# -----------------------------------------------------------------------------
# Stage: builder — produce the static Vite bundle.
# VITE_* build args are PUBLIC config inlined into the bundle. Provided by
# compose / CI; do NOT pass secrets. Output lands in apps/${APP_NAME}/dist.
# -----------------------------------------------------------------------------
FROM base AS builder
ARG APP_NAME
ARG VITE_API_BASE_URL
ARG VITE_WS_BASE_URL
ARG VITE_LIVEKIT_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_WS_BASE_URL=${VITE_WS_BASE_URL}
ENV VITE_LIVEKIT_URL=${VITE_LIVEKIT_URL}
# COPY --from=deps   /repo/ .
# COPY --from=pruner /repo/out/full/ .
# RUN pnpm dlx turbo run build --filter=@cowatch/${APP_NAME}

# -----------------------------------------------------------------------------
# Stage: runner — nginx-unprivileged static server (non-root by design).
# TODO(pin): nginxinc/nginx-unprivileged:1.27-alpine@sha256:<digest>
# Listens on 8080 (unprivileged cannot bind 80). Compose maps host -> 8080.
# -----------------------------------------------------------------------------
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runner
ARG APP_NAME
ENV TZ=UTC

# nginx conf provides: SPA history fallback (try_files ... /index.html),
# gzip/brotli, security headers (Helmet-equivalent), and a /healthz route.
# Forward-looking: ships from docker/nginx/ (DEPLOYMENT §2.3).
# COPY docker/nginx/${APP_NAME}.conf /etc/nginx/conf.d/default.conf
# COPY --from=builder /repo/apps/${APP_NAME}/dist /usr/share/nginx/html

# OCI provenance labels (DEPLOYMENT §2.1).
ARG GIT_SHA=unknown
ARG IMAGE_VERSION=0.0.0-dev
ARG IMAGE_CREATED=unknown
LABEL org.opencontainers.image.title="cowatch-${APP_NAME}" \
      org.opencontainers.image.source="https://github.com/cowatch/cowatch" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.version="${IMAGE_VERSION}" \
      org.opencontainers.image.created="${IMAGE_CREATED}"

# nginx-unprivileged already runs as uid 101 (non-root). No USER root anywhere.
EXPOSE 8080

# Liveness: the static /healthz endpoint defined in the nginx conf.
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
