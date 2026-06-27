# Project State — Next Task

> The single next task to pick up.
> **Status:** Phase 1 Slice 1 done → **Slice 2 (OAuth, guest, email verify, password reset, 2FA, real-DB integration).**
> **Owner agent:** Backend Engineer (lead)
> Last updated: 2026-06-27

---

## Snapshot

| Key | Value |
|---|---|
| `taskId` | `P1-AUTH-S2` |
| `title` | Phase 1 Slice 2 — remaining auth flows + real-DB integration |
| `phase` | `1` (Authentication) |
| `status` | `ready` |
| `precondition` | Slice 1 ([current-task.md](./current-task.md)) committed |
| `spec` | [specs/auth.spec.md](../specs/auth.spec.md) |

## Scope (Slice 2)

- **Google OAuth** (PKCE) and **guest accounts** (+ guest→registered upgrade).
- **Email verification** and **password reset** (`EmailToken` model + flows).
- **TOTP 2FA** enrollment + challenge + recovery codes.
- **Session management endpoints**: `GET /api/v1/auth/sessions`, `DELETE /api/v1/auth/sessions/:id`, revoke-all.
- **Real database integration**: wire a MongoDB (Atlas free tier or local `docker compose`) and add real integration tests (replica-set `mongodb-memory-server` or a test Atlas DB), replacing the interim in-memory Prisma double.
- **Tooling**: real ESLint flat-config (replace placeholder `lint`), and push coverage toward the **90%** target ([docs/TESTING.md](../docs/TESTING.md)).

## First Concrete Steps

1. Decide the dev database (Atlas vs Docker) and set `DATABASE_URL`; add `prisma db push` to the dev bootstrap.
2. Add the `EmailToken` Prisma model + the Google `AuthIdentity`/`googleId` flow.
3. Implement guest accounts + the session list/revoke endpoints (the `SessionService` revoke paths already exist).

## Cross-links

- Canon §8: [context/architecture.md](../context/architecture.md)
- Auth spec: [specs/auth.spec.md](../specs/auth.spec.md)
- Phase plan: [docs/PHASES.md](../docs/PHASES.md)
