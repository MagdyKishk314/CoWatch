# =============================================================================
# Cowatch — server image (NestJS REST + WS gateway) · multi-stage SKELETON
# =============================================================================
# Purpose : Forward-looking, commented multi-stage Dockerfile for the future
#           NestJS server build (ADR-002). Mirrors docs/DEPLOYMENT.md §2.2.
# Status  : Planning (Phase 0 — Architecture). FORWARD-LOOKING SKELETON.
# Owner   : DevOps Engineer
# Last updated: 2026-06-27
#
# -----------------------------------------------------------------------------
# PLANNING NOTE — apps/server DOES NOT EXIST YET. This Dockerfile will NOT build
# until the NestJS app + monorepo (Turborepo + pnpm, ADR-001) are scaffolded.
# It encodes the INTENDED build so it is ready on day one of Phase 1.
#
# Build rules enforced here (DEPLOYMENT §2.1):
#   1. Multi-stage, deterministic; prune the monorepo subgraph with `turbo prune`.
#   2. Pin base images BY DIGEST in real use (node:22-alpine@sha256:...), not :latest.
#   3. Non-root runtime user (appuser, uid 10001).
#   4. Minimal alpine final stage — no build tools, no pnpm, no source maps.
#   5. HEALTHCHECK baked in → liveness probe (canon §10).
#   6. Build args carry NO secrets; secrets injected at runtime via env only.
#   7. OCI provenance labels (git SHA, version, created).
#
# Build context = monorepo ROOT (compose `context: ..`).
#   docker build -f docker/server.Dockerfile -t cowatch/server .
# =============================================================================

# syntax=docker/dockerfile:1.7

# -----------------------------------------------------------------------------
# Stage: base — shared toolchain. PIN BY DIGEST in production.
# -----------------------------------------------------------------------------
# TODO(pin): replace :latest-style tag with node:22-alpine@sha256:<digest>
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
# corepack pins the exact pnpm version (ADR-001 — pnpm workspaces).
RUN corepack enable && corepack prepare pnpm@9 --activate
# libc6-compat helps some native deps (e.g. Prisma engines) on alpine.
RUN apk add --no-cache libc6-compat
WORKDIR /repo

# -----------------------------------------------------------------------------
# Stage: pruner — isolate the @cowatch/server subgraph so we only copy/install
# what that app needs. `--docker` emits out/json (manifests) + out/full (source).
# -----------------------------------------------------------------------------
FROM base AS pruner
COPY . .
# RUN pnpm dlx turbo prune @cowatch/server --docker

# -----------------------------------------------------------------------------
# Stage: deps — install ONLY the pruned subgraph's deps. Cache-mounted pnpm
# store + lockfile copy means this layer rebuilds only when deps change.
# -----------------------------------------------------------------------------
FROM base AS deps
# COPY --from=pruner /repo/out/json/ .
# RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
#     pnpm install --frozen-lockfile

# -----------------------------------------------------------------------------
# Stage: builder — compile TS + generate the Prisma client (ADR-003).
# Prisma schema lives at packages/database/prisma/schema.prisma (canon §4).
# -----------------------------------------------------------------------------
FROM base AS builder
# COPY --from=deps    /repo/ .
# COPY --from=pruner  /repo/out/full/ .
# Generate the typed Prisma client BEFORE the Nest build consumes it.
# RUN pnpm --filter @cowatch/database exec prisma generate
# RUN pnpm dlx turbo run build --filter=@cowatch/server
# Deploy a pruned, production-only node_modules for the runner stage.
# RUN pnpm --filter @cowatch/server deploy --prod /app-deploy

# -----------------------------------------------------------------------------
# Stage: runner — minimal, non-root, healthchecked. Ships ONLY dist + prod deps.
# TODO(pin): node:22-alpine@sha256:<digest>
# -----------------------------------------------------------------------------
FROM node:22-alpine AS runner
ENV NODE_ENV=production
ENV TZ=UTC
# canon §10 — server listens on 3000 (REST + WS multiplexed by `room`).
ENV PORT=3000

# Non-root runtime user (uid/gid 10001).
RUN addgroup -g 10001 app && adduser -u 10001 -G app -S appuser
WORKDIR /app

# Copy the built app + pruned production node_modules from the builder.
# COPY --from=builder --chown=appuser:app /app-deploy/node_modules ./node_modules
# COPY --from=builder --chown=appuser:app /repo/apps/server/dist   ./dist
# Prisma query engine binary must travel with the image for alpine/musl.
# COPY --from=builder --chown=appuser:app /repo/packages/database/node_modules/.prisma ./node_modules/.prisma

# OCI provenance labels (DEPLOYMENT §2.1). Values supplied by CI build args.
ARG GIT_SHA=unknown
ARG IMAGE_VERSION=0.0.0-dev
ARG IMAGE_CREATED=unknown
LABEL org.opencontainers.image.title="cowatch-server" \
      org.opencontainers.image.source="https://github.com/cowatch/cowatch" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.version="${IMAGE_VERSION}" \
      org.opencontainers.image.created="${IMAGE_CREATED}"

USER appuser
EXPOSE 3000

# Liveness probe — process is up (no deps checked). canon §10 / DEPLOYMENT §8.3.
# Readiness (/health/ready: mongo+minio+redis+livekit) is polled by the LB,
# not by Docker, so a dependency blip does not kill the container.
HEALTHCHECK --interval=15s --timeout=3s --start-period=25s --retries=3 \
  CMD node dist/health-probe.js || exit 1

# Bootstrap order at runtime (forward-looking): apply pending Prisma changes,
# then start Nest. Kept as a comment until the app exists.
# CMD ["sh", "-c", "node dist/prisma-deploy.js && node dist/main.js"]
CMD ["node", "dist/main.js"]
