# packages/auth — Auth Client & Guard Helpers

> One-line purpose: Shared authentication helpers — client-side token/session management and server-side NestJS guard helpers — implementing the ADR-008 token model.

**Status:** Placeholder — Phase 0 (Architecture). **No code yet** (rule R1: plan before code). This README documents the planned shape of `packages/auth`.
**Owner agent:** Backend Engineer
**Last updated: 2026-06-27**

**Canon & cross-links**

- Architecture canon: [../../context/architecture.md](../../context/architecture.md)
- Repository map: [../../INDEX.md](../../INDEX.md)
- Governing docs/ADR: [AUTH](../../docs/AUTH.md) · [SECURITY](../../docs/SECURITY.md) · [ADR-008](../../adr/ADR-008-auth.md)

---

## Purpose

`packages/auth` centralizes the **non-UI authentication logic** shared across the stack so the token model is implemented once. On the **client** it provides access-token storage/refresh orchestration, the silent-refresh flow against `POST /api/v1/auth/refresh`, and session helpers. On the **server** it provides reusable **NestJS guard helpers**, JWT (RS256) verification utilities, role/permission extraction, and 2FA helpers. It does **not** own UI (that's [packages/ui](../ui/README.md) + [apps/web](../../apps/web/README.md)) or the user persistence model (that's the server's `AuthModule`).

## Owning agent

**Backend Engineer.**

## Planned tech

| Concern | Choice |
|---|---|
| Tokens | JWT access (15 min, RS256) + opaque rotating refresh (30 day) per [ADR-008](../../adr/ADR-008-auth.md) |
| Refresh delivery | httpOnly, Secure, SameSite=Strict cookie scoped to `/api/v1/auth` |
| Server guards | NestJS guard helpers (auth, role, sync-authority) |
| 2FA | TOTP enroll/verify helpers + recovery codes |
| Types | [packages/types](../types/README.md) for claims, session, and DTO shapes |

## Planned contents

```
packages/auth/
  src/
    client/              # token store, refresh orchestrator, session helpers
    server/              # NestJS guard helpers, JWT verify, claims extraction
    tokens/              # claim shapes, RS256 sign/verify utilities
    twofa/               # TOTP + recovery-code helpers
    index.ts             # barrel
```

- File naming `kebab-case.ts`; NestJS guard files use the `.guard.ts` suffix when they ship as Nest providers (canon §3).
- Token claim shapes (`sub`, `sid`, `kind`, `roles`, `iat`, `exp`) are typed in [packages/types](../types/README.md) and consumed here.

## Contracts it must honor

- Access token 15-minute lifetime; refresh 30-day, rotating, with **reuse detection** revoking the whole session family (canon §8).
- Device-session endpoints (`GET/DELETE /api/v1/auth/sessions[...]`) and refresh rotation semantics.

## Which docs/specs govern this package

- **Primary docs:** [AUTH.md](../../docs/AUTH.md), [SECURITY.md](../../docs/SECURITY.md); ADR [ADR-008](../../adr/ADR-008-auth.md).
- **Specs:** the auth spec in [../../specs/](../../specs/) (R5).
- **Phase:** **Phase 1 (Authentication)**.

## Status notes

Empty today. Built first in Phase 1, shared by [apps/server](../../apps/server/README.md) and [apps/web](../../apps/web/README.md).
