# Project State — Current Task

> What the team is actively doing right now.
> **Status:** Phase 1 (Authentication) — **Slices 1 + 2a done** (core email/password auth + device sessions + guest accounts + session management). Next: Slice 2b — see [next-task.md](./next-task.md).
> **Owner agent:** Backend Engineer (lead)
> Last updated: 2026-06-27

> Amended 2026-06-27: Stakeholder approved starting Phase 1 (R1 gate cleared, BLK-001). Slice 1 of the staged Phase-1 build is complete: monorepo toolchain + core auth vertical, build/lint/typecheck/test all green.

---

## Snapshot

| Key | Value |
|---|---|
| `taskId` | `P1-AUTH-S1` |
| `title` | Phase 1 Slice 1 — core email/password auth + device sessions |
| `phase` | `1` (Authentication) |
| `status` | `done` (Slice 1); Slice 2 is next ([next-task.md](./next-task.md)) |
| `assignee` | Backend Engineer |

## What was built (Slice 1)

- **Monorepo toolchain online**: pnpm 9 + Turborepo; `build`, `lint`, `typecheck`, `test` wired across the workspace.
- **`packages/types`** — shared auth contracts (`AccessTokenClaims`, `AuthTokens`, `PublicUser`/`SelfUser`, enums).
- **`packages/database`** — Prisma (MongoDB) **auth subset** schema: `User`, `Session` + embedded `UserProfile`/`PresenceSnapshot`/`DeviceMetadata`/`RefreshTokenFamily`, faithful to [docs/DATABASE.md](../docs/DATABASE.md).
- **`apps/server`** (NestJS): zod-validated config, global `PrismaModule`, `/api/healthz`, URI versioning, global `ValidationPipe`, canon §10 error-envelope filter.
- **Auth core**: argon2id password hashing (`@node-rs/argon2`); RS256 access JWT (15 min) + **opaque rotating refresh** `<sessionId>.<secret>` (only the SHA-256 is stored) with **reuse detection** → family revoke; device `Session` lifecycle.
- **Auth REST**: `POST /api/v1/auth/register|login|refresh|logout`, `GET /api/v1/auth/me`; httpOnly refresh cookie scoped to `/api/v1/auth`; `JwtAuthGuard` + `@CurrentUser`.
- **Tests**: **21 passing** — unit (password, token, session/reuse-detection) + full e2e auth flow (register → login → /me → refresh → logout-revokes-refresh) via an in-memory Prisma double.

## Definition of Done (Slice 1)

- [x] `pnpm run build` green (3/3)
- [x] `pnpm run typecheck` green (5/5)
- [x] `pnpm run lint` green (placeholder; real ESLint flat-config is Slice 2)
- [x] `pnpm run test` green (21/21)
- [x] Reuse-detection + revocation paths covered by tests

## Notes / known gaps (carried to Slice 2)

- **No live MongoDB locally** (no Docker/Atlas here): the e2e uses an in-memory Prisma double. Wiring a real Mongo (Atlas or `docker compose`) for true integration tests is the first Slice-2 infra step.
- **Deferred to Slice 2+**: Google OAuth, guest accounts, email verification, password reset, TOTP 2FA, `GET/DELETE /auth/sessions`, real ESLint config, and pushing coverage toward the 90% target.
- **Dev/prod resolution**: dev/test consume `@cowatch/*` from source (path aliases / jest mapper); the production `build` consumes built `dist`.
