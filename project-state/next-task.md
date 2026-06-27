# Project State — Next Task

> The single next task to pick up.
> **Status:** Slices 1 + 2a done → **Slice 2b (email verification + password reset + TOTP 2FA + real ESLint).**
> **Owner agent:** Backend Engineer (lead)
> Last updated: 2026-06-27

---

## Snapshot

| Key | Value |
|---|---|
| `taskId` | `P1-AUTH-S2B` |
| `title` | Phase 1 Slice 2b — email verification, password reset, 2FA, ESLint |
| `phase` | `1` (Authentication) |
| `status` | `ready` |
| `precondition` | Slice 2a ([current-task.md](./current-task.md)) committed |
| `spec` | [specs/auth.spec.md](../specs/auth.spec.md) |

## Scope (Slice 2b — self-contained, no external infra)

- **`EmailToken` Prisma model** (purpose: `verify_email` | `reset_password`; hashed token; `expiresAt` TTL).
- **Email verification**: issue on register, `POST /auth/verify-email` (token), resend; set `emailVerifiedAt`.
- **Password reset**: `POST /auth/forgot-password` (always 202), `POST /auth/reset-password` (token → new password; revoke all sessions).
- **TOTP 2FA**: enroll (`/auth/2fa/setup` → secret+otpauth), confirm, challenge on login, recovery codes; encrypt `totpSecretEnc` at rest.
- **Mail transport**: a `MailerService` interface with a dev/test `LogMailer` (real SMTP wired later, config-driven) — keeps this slice infra-free.
- **Real ESLint flat-config** (`eslint` + `typescript-eslint`); replace the placeholder `lint` scripts; fix findings.

## Slice 2c (needs your input — external dependencies)

- **Google OAuth (PKCE)** — needs a Google OAuth **client id/secret**.
- **Real MongoDB integration tests** — needs either a **MongoDB Atlas** connection string from you, or I use **`mongodb-memory-server`** (downloads a `mongod` replica-set binary). This replaces the interim in-memory Prisma double and lets us push coverage toward the 90% target.

## Cross-links

- Canon §8: [context/architecture.md](../context/architecture.md)
- Auth spec: [specs/auth.spec.md](../specs/auth.spec.md)
- Phase plan: [docs/PHASES.md](../docs/PHASES.md)
