# Deployment Context — Cowatch

> One-line purpose: Fast-load digest of the **Docker-first deployment topology**, targets, config strategy, and operational non-negotiables — pointing to the full design doc.

**Status:** Context digest (Planning — Phase 0)
**Owner agent:** Documentation Engineer
**Last updated: 2026-06-27**

> This is a **condensed context file** for fast restore (R2). It summarizes and **points to** the full design. On any conflict the source wins, in this order: [Architecture Canon](./architecture.md) → [DEPLOYMENT.md](../docs/DEPLOYMENT.md) → this digest.

---

## TL;DR

**Docker-first** ([ADR-010](../adr/)): every Cowatch service runs in Docker for reproducible parity across **four targets** — `local`, `vps`, `vercel`, `production`. The default production posture is a **native-WebSocket VPS** deployment; serverless/edge is a future target reached by swapping the realtime adapter, not rewriting product code.

## Binding constraints (canon-inherited)

| # | Constraint | Source |
|---|---|---|
| D1 | **Docker-first** — every service containerized; parity dev→prod. | [ADR-010](../adr/) |
| D2 | **Replaceable realtime transport** — target selects via `REALTIME_TRANSPORT`; apps unaware. | [ADR-004](../adr/) |
| D3 | **Server-authoritative playback** — realtime/sync tier is **stateful**; needs a shared coordination layer (Redis) to scale horizontally. | [ADR-007](../adr/) |
| D4 | **Secrets only via env / secret store**, never committed; least-privilege MinIO buckets (signed URLs). | [Canon §10](./architecture.md#10-cross-cutting-non-negotiables) |
| D5 | **Observability everywhere** — pino JSON logs, Prometheus metrics, `/health/live` + `/health/ready` on every service, ULID `correlationId` via `x-correlation-id` + envelope `corr`. | Canon §10 |
| D6 | **TLS everywhere**, strict CORS allowlist, Helmet, per-IP + per-user rate limiting. | Canon §10 |
| D7 | **Time in UTC** ISO-8601 / epoch ms; all containers run UTC. | Canon §10 |

## Services to ship (from the path map)

`apps/server` (NestJS REST + WS gateways), `apps/web` (React/Vite static), `apps/landing` (marketing), plus backing services: **MongoDB** (via Prisma, [ADR-003](../adr/)), **MinIO** (object storage, [ADR-009](../adr/)), **LiveKit** (voice/video SFU, [ADR-005](../adr/)), and **Redis** (realtime backplane / coordination for horizontal scale). `apps/desktop` (Electron) ships via electron-builder auto-update, not as a container ([ADR-006](../adr/)).

## Scaling note

The WS/sync tier is stateful (server holds `PlaybackState`). Horizontal scale requires a backplane (Redis pub/sub + presence registry) so any replica can fan out to any room. See [ARCHITECTURE.md §7](../docs/ARCHITECTURE.md#7-horizontal-scaling-strategy) and [REALTIME.md](../docs/REALTIME.md).

## Boundaries (what deployment does NOT own)

- Application-level architecture & module breakdown → [ARCHITECTURE.md](../docs/ARCHITECTURE.md)
- Security control design (authz, hashing, token model) → [SECURITY.md](../docs/SECURITY.md) / [AUTH.md](../docs/AUTH.md)
- Realtime transport mechanics → [realtime.md](./realtime.md) / [REALTIME.md](../docs/REALTIME.md)

---

## Source documents (read these for detail)

| Topic | Authoritative doc |
|---|---|
| Full deployment design (topology, CI/CD, config, DR, observability) | [../docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md) |
| System architecture & scaling strategy | [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) |
| Security baseline | [../docs/SECURITY.md](../docs/SECURITY.md) |
| Canon — cross-cutting non-negotiables | [./architecture.md#10-cross-cutting-non-negotiables](./architecture.md#10-cross-cutting-non-negotiables) |
| ADRs | [../adr/](../adr/) (ADR-010, ADR-004, ADR-005, ADR-009) |

## Sibling context digests

[business.md](./business.md) · [realtime.md](./realtime.md) · [permissions.md](./permissions.md) · [social.md](./social.md) · [ui.md](./ui.md) · [RESTORE_CONTEXT.md](./RESTORE_CONTEXT.md)
