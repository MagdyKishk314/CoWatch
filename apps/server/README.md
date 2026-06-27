# @cowatch/server

NestJS backend for Cowatch (ADR-002). **Phase 1, Slice 1** implements the core
authentication vertical: email/password registration & login, RS256 access
tokens, rotating opaque refresh tokens with reuse detection, and device
sessions. See [docs/AUTH.md](../../docs/AUTH.md), [ADR-008](../../adr/ADR-008-auth.md),
and canon [§8](../../context/architecture.md).

## What exists today (Slice 1)

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/healthz` | — | liveness probe |
| `POST /api/v1/auth/register` | — | create account, issue tokens |
| `POST /api/v1/auth/login` | — | password login, issue tokens |
| `POST /api/v1/auth/refresh` | refresh cookie/body | rotate tokens (reuse-detected) |
| `POST /api/v1/auth/logout` | access token | revoke current session |
| `GET /api/v1/auth/me` | access token | current user (self view) |

- **Access token**: RS256 JWT, 15 min, claims `sub`/`sid`/`kind`/`roles`/`isGuest`.
- **Refresh token**: opaque `<sessionId>.<secret>` (only SHA-256 stored); httpOnly cookie scoped to `/api/v1/auth`; rotates on every use; reuse outside the grace window revokes the session.
- **Passwords**: argon2id (`@node-rs/argon2`).
- **Errors**: canon §10 envelope `{ error: { code, message, details?, correlationId } }`.

## Develop

```bash
pnpm --filter @cowatch/database generate   # generate the Prisma client (once)
pnpm --filter @cowatch/server test         # unit + e2e (21 tests)
pnpm --filter @cowatch/server typecheck
pnpm --filter @cowatch/server start:dev    # needs a MongoDB at DATABASE_URL
```

Configuration is validated at boot (`src/config/env.validation.ts`). In dev/test,
if `AUTH_JWT_PRIVATE_KEY`/`AUTH_JWT_PUBLIC_KEY` are unset an ephemeral RS256
keypair is generated (tokens then reset on restart).

## Not yet wired (Slice 2+)

Google OAuth, guest accounts, email verification, password reset, TOTP 2FA,
`GET/DELETE /auth/sessions`, real ESLint config, and a live MongoDB for true
integration tests (Slice 1 e2e uses an in-memory Prisma double). The planned
full module layout (rooms, playback, chat, social, voice, …) lands in later
phases per [docs/PHASES.md](../../docs/PHASES.md).
