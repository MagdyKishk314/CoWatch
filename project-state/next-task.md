# Project State — Next Task

> The single next task to pick up once the current task unblocks.
> **Status:** Queued (gated on approval).
> **Owner agent:** Backend Engineer (lead) + Frontend Engineer
> Last updated: 2026-06-27

---

## Snapshot

| Key | Value |
|---|---|
| `taskId` | `P1-AUTH-KICKOFF` |
| `title` | Phase 1 — Authentication kickoff |
| `phase` | `1` (Authentication) |
| `status` | `queued` |
| `precondition` | `BLK-001` cleared (stakeholder approval, R1) |
| `spec` | [specs/auth.spec.md](../specs/auth.spec.md) |
| `phasePlan` | [docs/PHASES.md](../docs/PHASES.md) |

## Scope (from canon §8 + SPEC)

Implement the auth foundation per [ADR-008](../adr/ADR-008-auth-tokens.md) and
[canon §8](../context/architecture.md#8-auth--token-model-adr-008):

- `AuthModule` (NestJS): REST controllers + guards + WS auth.
- Access JWT (RS256, 15 min) + rotating refresh token (opaque, 30 day, httpOnly cookie).
- Refresh rotation + reuse detection (theft response: revoke session family).
- Device `Session` management (`GET/DELETE /api/v1/auth/sessions[/:id]`).
- Flows: email/password, Google OAuth, guest, email verification, password reset, TOTP 2FA.
- Prisma models: `users`, `sessions` (per [canon §4](../context/architecture.md#4-data-modeling-conventions-mongodb--prisma)).

## Entry Checklist (R5 — must exist before coding)

- [ ] [specs/auth.spec.md](../specs/auth.spec.md) approved
- [ ] Auth implementation tasks listed in `tasks/`
- [ ] Auth test plan + acceptance criteria defined
- [ ] Auth docs stub in `docs/`
- [ ] ADR-008 confirmed current (amend only via R3 if changed)

## First Concrete Steps

1. Scaffold `apps/server` NestJS app + `AuthModule` skeleton (no business logic yet → first commit).
2. Add `users` + `sessions` Prisma models to `packages/database/prisma/schema.prisma`.
3. Implement token issuance/rotation service against the test plan.

## Cross-links

- Canon: [context/architecture.md](../context/architecture.md)
- Phases: [docs/PHASES.md](../docs/PHASES.md)
- Blockers gating this: [blockers.md](./blockers.md)
