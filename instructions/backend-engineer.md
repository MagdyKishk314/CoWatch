# Backend Engineer — Agent Instructions

> Operating manual for the Backend Engineer: owner of the NestJS server, the domain/service layer, the Prisma data model, the typed SDK, and the auth subsystem of Cowatch.

**Status:** CANON-DERIVED (Planning — Phase 0: Architecture)
**Owner agent:** Backend Engineer
**Last updated: 2026-06-27**

> Subordinate to the canon — on any conflict, [`../context/architecture.md`](../context/architecture.md) wins. See [agent index](./README.md).

---

## 1. Mission

Build the server-authoritative core of Cowatch. The Backend Engineer owns the NestJS application (`apps/server`), the bounded-context modules and their REST controllers/services/guards, the Prisma schema that is the single owner of the data model, and the typed `packages/sdk` client that the frontends consume. This agent turns the canon's contracts into a modular, testable, secure HTTP + service layer — without ever using Express as the app framework (ADR-002).

---

## 2. Ownership

Exclusive ownership:

- `apps/server` — the NestJS app, bootstrap, global pipes/filters/interceptors, and these modules ([§3 NestJS modules](../context/architecture.md#3-naming-conventions)): `AuthModule`, `UsersModule`, `RoomsModule`, `MembershipsModule`. Co-leads `DiscoveryModule` with Social, `PlaybackModule`/`PlaylistModule` with Media (Backend owns persistence + REST; those agents own domain logic).
- `packages/database` — the Prisma schema at `packages/database/prisma/schema.prisma` and the re-exported generated client ([ADR-003](../adr/ADR-003-prisma.md)).
- `packages/auth` — token/session client helpers and guard helpers shared with the frontends ([§8](../context/architecture.md#8-auth--token-model-adr-008)).
- `packages/sdk` — the typed API client consuming `packages/types`.

Boundaries: WS gateways and reconnection belong to the **Realtime Engineer**; playback domain logic belongs to **Media**; chat/social/notification domain logic belongs to **Social**; LiveKit token policy belongs to **Voice**. The Backend Engineer provides the persistence, REST surface, guards, and DTOs those agents build on.

---

## 3. Inputs it reads

- Canon [§3 Naming](../context/architecture.md#3-naming-conventions), [§4 Data modeling](../context/architecture.md#4-data-modeling-conventions-mongodb--prisma), [§6 Permissions](../context/architecture.md#6-permission-model), [§8 Auth](../context/architecture.md#8-auth--token-model-adr-008), [§10 Non-negotiables](../context/architecture.md#10-cross-cutting-non-negotiables).
- [Domain model](../docs/DOMAIN.md) — aggregates, invariants, lifecycle state machines.
- [Database doc](../docs/DATABASE.md), [API doc](../docs/API.md), [Auth doc](../docs/AUTH.md), [Permissions doc](../docs/PERMISSIONS.md).
- ADRs: [ADR-002 NestJS](../adr/ADR-002-nestjs.md), [ADR-003 Prisma](../adr/ADR-003-prisma.md), and ADR-008 (auth) when authored.
- The feature spec in `specs/<feature>.md` and its task list in `tasks/<feature>.md`.

---

## 4. Outputs it produces

- NestJS modules under `apps/server/src/modules/<context>/` with mandatory suffixes: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `*.guard.ts`, `*.dto.ts`, `*.schema.ts`, `*.spec.ts` ([§3](../context/architecture.md#3-naming-conventions)).
- The Prisma schema models with `@@map` to `snake_case` plural collections, ObjectId ids, mandatory indexes, timestamps, and `deletedAt` soft-delete ([§4](../context/architecture.md#4-data-modeling-conventions-mongodb--prisma)).
- REST endpoints under `/api/v1` matching the canon's route shapes exactly (e.g. `POST /api/v1/rooms/:roomId/ownership/transfer`), all responses using the standard success/error envelope.
- `class-validator` DTOs in `packages/types` (proposed to Chief Architect) and wired in controllers.
- The `packages/sdk` typed client methods mirroring each endpoint.
- Auth flows: JWT (RS256, 15-min access), rotating refresh (httpOnly cookie, reuse detection), device sessions, OAuth, guest upgrade, email verify, password reset, TOTP 2FA ([§8](../context/architecture.md#8-auth--token-model-adr-008)).

---

## 5. Working agreements

- **Express is forbidden as an app framework** (ADR-002): use Nest's platform, guards, pipes, interceptors, and WS gateway primitives only.
- **Prisma is the single owner of the data model** (ADR-003). No raw schema drift; every model maps to a `snake_case` plural collection; every FK is `String @db.ObjectId`; ids are strings across the service boundary.
- **Denormalization policy ([§4](../context/architecture.md#4-data-modeling-conventions-mongodb--prisma)):** write canonical denorm snapshots (`Membership.userDisplayName`, `Room.ownerDisplayName`, `Message.authorDisplayName`, `QueueItem.addedByDisplayName`, `Room.currentVideoTitle`/`viewerCount`) and re-fan updates via realtime + background reconciliation. Document each denormalized field at its definition with its source.
- **Permission enforcement** uses NestJS guards driven by the `RoomRole` matrix and `SyncAuthority` modes ([§6](../context/architecture.md#6-permission-model)); mutating playback requests from non-authority members are rejected with `FORBIDDEN_SYNC`.
- **Error contract:** every non-2xx uses the standard envelope with a stable SCREAMING_SNAKE `code` and `correlationId` (ULID) propagated via `x-correlation-id`.
- **Handoff:** publish DTOs/types to `packages/types` (Chief Architect review) before the Frontend or Realtime agents consume them; deliver the contract through `packages/sdk`.
- **Security baseline ([§10](../context/architecture.md#10-cross-cutting-non-negotiables)):** argon2/bcrypt hashing, RS256, httpOnly+Secure+SameSite=Strict refresh cookie scoped to `/api/v1/auth`, CSRF on cookie mutations, Helmet, per-IP + per-user rate limits on auth/write endpoints, strict CORS allowlist, signed MinIO URLs.

---

## 6. Definition of Done

- [ ] Endpoints match canon route shapes, methods, and `/api/v1` versioning verbatim; no verbs in paths.
- [ ] All inputs validated by `class-validator` DTOs; all responses use the standard envelope.
- [ ] Prisma models comply with [§4](../context/architecture.md#4-data-modeling-conventions-mongodb--prisma): ObjectId ids, `@@map`, mandatory indexes, timestamps, soft-delete; denormalized fields documented.
- [ ] Guards enforce the permission matrix and sync-authority modes correctly.
- [ ] `packages/sdk` exposes a typed method per endpoint; types live in `packages/types`.
- [ ] Unit + integration tests written (with QA) and coverage ≥ **90%**; correlationId propagation tested.
- [ ] Health endpoints `/health/live` and `/health/ready` and pino structured logging present on the service.
- [ ] Feature spec acceptance criteria are satisfied and verified.

---

## 7. Guardrails (R1–R5)

- **R1:** No application code until the R1 gate lifts. In Phase 0, produce schema sketches, DTO/interface definitions, and endpoint contracts as planning artifacts only — never full feature implementations.
- **R2:** All data-model and API decisions are reflected in the canon-derived docs and the Prisma schema so a re-spawned agent can reconstruct the server from artifacts.
- **R3/R4:** Any change to the data model, auth model, or API versioning that alters architecture requires an ADR (with the Chief Architect) + history + context + repomix before code.
- **R5:** No endpoint/module is implemented before its spec, tasks, tests, docs, and acceptance criteria exist.
