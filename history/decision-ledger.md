# Decision Ledger

> Append-only, chronological ledger of every architectural and process-level decision made on the Cowatch platform.

**Status:** Living (append-only)
**Owner agent:** Historian Engineer
**Last updated: 2026-06-27**

> Amended 2026-06-27: added D-011 (ADR-011 realtime backplane), ADR-009/ADR-010 backfill notes, and canon-amendment rows for `room_bans` / `join_requests` / `activity_events`, the `room:member:update` event, and the `playlistAuthority` field; process-discipline ADR renumbered to ADR-012/D-012 (Deferred-to-Phase-1).

---

## Purpose

This ledger is the **single chronological index of every architectural decision** taken on Cowatch. It satisfies process rules **R3/R4**: no architecture change ships without an ADR **and** a corresponding row here. Where the [Architecture Canon](../context/architecture.md) is the *current* state of truth, this ledger is the *history* of how we got there.

- One row per decision, newest at the bottom of each dated section (append-only).
- Every architectural row MUST link to its ADR under [`../adr/`](../adr/).
- Rows are **never edited to rewrite history**. If a decision is reversed, add a **new** row that supersedes the old one and update the old row's `Status` to `Superseded by …`.
- Cross-references: [lessons-learned.md](./lessons-learned.md) · [breaking-changes.md](./breaking-changes.md) · [migrations.md](./migrations.md) · [technical-debt.md](./technical-debt.md) · [mistakes.md](./mistakes.md) · [bugs.md](./bugs.md).

---

## Entry Format / Template

Copy this row into the table for the relevant date. Keep columns terse; deep rationale belongs in the ADR.

```md
| <id> | YYYY-MM-DD | <short decision title> | <Architecture | Process | Tooling | Data | Security> | <Accepted | Proposed | Superseded by ADR-NNN | Reversed> | [ADR-NNN](../adr/ADR-NNN-kebab-title.md) | <one-line rationale> | <agent role> |
```

**Field rules**

| Field | Rule |
|---|---|
| `id` | Stable sequential key `D-NNN`. Never reused, never renumbered. |
| `date` | UTC date the decision was **accepted** (ISO-8601, `YYYY-MM-DD`). |
| `decision` | Imperative, specific noun phrase (e.g. "Adopt Prisma over MongoDB"). |
| `category` | One of: `Architecture`, `Process`, `Tooling`, `Data`, `Security`. |
| `status` | `Accepted` \| `Proposed` \| `Superseded by ADR-NNN` \| `Reversed`. |
| `adr` | Relative link to the backing ADR. `—` only for non-architectural process decisions that legitimately have no ADR. |
| `rationale` | One line. Full reasoning lives in the ADR. |
| `owner` | Agent role accountable for the decision. |

---

## 2026-06-27 — Phase 0 (Architecture) Foundation

The founding architectural baseline of Cowatch. Every row below corresponds to a ratified ADR and is reflected verbatim in the [Architecture Canon](../context/architecture.md).

| id | date | decision | category | status | adr | rationale | owner |
|---|---|---|---|---|---|---|---|
| D-001 | 2026-06-27 | Monorepo via Turborepo + pnpm workspaces | Tooling | Accepted | [ADR-001](../adr/ADR-001-monorepo-turborepo-pnpm.md) | One atomic, versioned codebase across 4 apps + 8 packages with a cached task pipeline. | Chief Architect |
| D-002 | 2026-06-27 | Backend on NestJS (REST + WS gateways + JWT + OAuth); Express-as-framework forbidden | Architecture | Accepted | [ADR-002](../adr/ADR-002-backend-nestjs.md) | Modular DI, decorators, first-class WebSocket gateways and guards. | Chief Architect |
| D-003 | 2026-06-27 | Prisma ORM over MongoDB (document-oriented) | Data | Accepted | [ADR-003](../adr/ADR-003-prisma-mongodb.md) | Typed client + migration workflow while remaining NoSQL/document-native. | Backend Engineer |
| D-004 | 2026-06-27 | Custom Realtime abstraction layer with replaceable transport | Architecture | Accepted | [ADR-004](../adr/ADR-004-realtime-abstraction.md) | Avoid transport lock-in: native WS on VPS today, serverless adapters later. | Realtime Engineer |
| D-005 | 2026-06-27 | LiveKit for voice / video / screen share | Architecture | Accepted | [ADR-005](../adr/ADR-005-livekit-voice.md) | Scalable WebRTC SFU; data channels available as a future realtime transport. | Voice Engineer |
| D-006 | 2026-06-27 | Electron + electron-builder desktop app | Architecture | Accepted | [ADR-006](../adr/ADR-006-electron-desktop.md) | Native shell reusing the web app: PiP, push, HW accel, auto-update, IPC. | Electron Engineer |
| D-007 | 2026-06-27 | Server-authoritative playback sync (drift target < 500 ms) | Architecture | Accepted | [ADR-007](../adr/ADR-007-server-authoritative-sync.md) | Deterministic single source of truth for the playback clock. | Media Engineer |
| D-008 | 2026-06-27 | JWT access + rotating refresh tokens, httpOnly cookie, device sessions, TOTP 2FA | Security | Accepted | [ADR-008](../adr/ADR-008-auth-tokens.md) | Short-lived access + revocable, reuse-detecting rotating refresh families. | Backend Engineer |
| D-009 | 2026-06-27 | MinIO S3-compatible object storage | Architecture | Accepted | [ADR-009](../adr/ADR-009-minio-storage.md) | Self-hostable storage for avatars, room assets, uploads, thumbnails, caches; S3 API portability. | DevOps Engineer |
| D-010 | 2026-06-27 | Docker-first delivery across all environments | Tooling | Accepted | [ADR-010](../adr/ADR-010-docker-first.md) | Reproducible parity from local → VPS → Vercel → production. | DevOps Engineer |

---

## Open Questions

- **ADR numbering for process rules (R1–R5):** the process discipline is canonized but not yet captured as a standalone ADR. *Recommendation:* author `ADR-011-process-discipline.md` and back-link `D-011` here so the plan-before-code mandate has a formal architectural record rather than living only in canon prose.
  - **Resolution (2026-06-27):** ADR-011 is now claimed by the **Realtime Backplane** (Redis pub/sub + Streams; see D-011 below). The process-discipline ADR is **renumbered ADR-012 / D-012** and **Deferred-to-Phase-1**; the plan-before-code mandate already lives in canon §10 and is captured by lessons L-001/L-002, so no broken link or open decision results. — Status: Resolved (PROC-1).
- **Storage/deploy split:** D-009 (MinIO) and D-010 (Docker) are recorded as distinct decisions per the assignment ("the 8 ADRs + storage + deploy"). If MinIO and Docker are ever consolidated into an infrastructure ADR, supersede both rows rather than editing them.
  - **Resolution (2026-06-27):** D-009/D-010 ratified as-is; the long-form ADR files `adr/ADR-009-minio-storage.md` and `adr/ADR-010-docker-first.md` were **backfilled** (B1) to match the canonical decisions verbatim — no decision change. Pre-existing short-vs-long ADR filename skew on disk is logged separately as DOC-1 (Deferred-to-Phase-1, see [technical-debt.md](./technical-debt.md)). — Status: Resolved (B1).

---

## 2026-06-27 — Open-Questions Remediation (Phase-0 punch-list clear)

Remediation of the Phase-0 open-questions punch-list under the Chief Architect's binding resolutions. Per PROC-2, the **only new ADR authored in this pass is ADR-011**; the ADR-009/ADR-010 files were **backfilled** to ratify pre-existing canonical decisions (no decision change). All other items (B3–B6 + every OQ) are **data/contract-model changes** recorded as canon amendments here and in [history/migrations.md](./migrations.md) — **not** ADRs (per resolution §0.3).

### Architectural decision (ADR-backed)

| id | date | decision | category | status | adr | rationale | owner |
|---|---|---|---|---|---|---|---|
| D-011 | 2026-06-27 | Realtime Backplane = Redis pub/sub (fan-out) + Redis Streams (resume buffer); Mongo change streams as secondary reconciliation | Architecture | Accepted | [ADR-011](../adr/ADR-011-realtime-backplane.md) | Load-bearing multi-instance fan-out promoted out of ADR-004's implementation detail; sits below ADR-004's transport abstraction so serverless adapters (Durable Objects) swap the bus without touching feature code. Per-room single-writer via Redis lock `playback:lock:{roomId}` + monotonic `seq`. (B2 / ARCH OQ-1 / RT OQ-1 / DEPLOY OQ-1.) | Realtime Engineer |

### ADR backfills (no decision change — ratify existing canon)

| id | date | note | category | status | adr | rationale | owner |
|---|---|---|---|---|---|---|---|
| D-009 (backfill) | 2026-06-27 | ADR-009 file authored to ratify the already-Accepted MinIO decision (D-009 row above is unchanged) | Architecture | Accepted (file backfilled) | [ADR-009](../adr/ADR-009-minio-storage.md) | B1: D-009 was Accepted in canon §2 but the ADR file was never written; backfilled in ADR-008/ADR-004 house style. No decision change. | Historian Engineer |
| D-010 (backfill) | 2026-06-27 | ADR-010 file authored to ratify the already-Accepted Docker-first decision (D-010 row above is unchanged) | Tooling | Accepted (file backfilled) | [ADR-010](../adr/ADR-010-docker-first.md) | B1: D-010 was Accepted in canon §2 but the ADR file was never written; backfilled in house style. No decision change. | Historian Engineer |

### Canon amendments (data/contract model — NOT ADRs, per resolution §0.3)

These rows index data-model and event-catalog amendments to the [Architecture Canon](../context/architecture.md). Full schema/index/migration detail lives in [docs/DATABASE.md](../docs/DATABASE.md), [docs/EVENTS.md](../docs/EVENTS.md), and [history/migrations.md](./migrations.md). No ADR is required for these (B3/B4/B5/B6 + all OQs).

| id | date | amendment | category | status | adr | rationale | owner |
|---|---|---|---|---|---|---|---|
| CA-001 | 2026-06-27 | Add collection `room_bans` (canon amendment) | Data | Accepted | — (canon §3/§4; [migrations.md](./migrations.md)) | B3 / PERM OQ-2: durable bans that outlive membership deletion; unique `(roomId,userId)` + optional `expiresAt` TTL for temp-bans. | Historian Engineer |
| CA-002 | 2026-06-27 | Add collection `join_requests` (canon amendment) | Data | Accepted | — (canon §3/§4; [migrations.md](./migrations.md)) | B3 / PERM OQ-4: pending join-approval queue; partial-unique `(roomId,userId) where status=pending` + `expiresAt` TTL ≈10 min. | Historian Engineer |
| CA-003 | 2026-06-27 | Confirm collection `activity_events` (canon amendment) | Data | Accepted | — (canon §3/§4; already in [docs/DATABASE.md](../docs/DATABASE.md) §3) | B3: append-only social feed distinct from notifications; `(userId,createdAt)` index, 180-day TTL. Confirmed, added to canon §3 inventory. | Historian Engineer |
| CA-004 | 2026-06-27 | Confirm collections `role_assignments` & `votes` (canon amendment) | Data | Accepted | — (canon §3; verified in [docs/DATABASE.md](../docs/DATABASE.md) §3) | B4: `role_assignments (roomId,createdAt)+(membershipId,createdAt)` durable/no-TTL/append-only; `votes` unique `(queueItemId,userId,kind)+(queueItemId,kind)`. Frozen as-is; added to canon §3 list. | Historian Engineer |
| CA-005 | 2026-06-27 | Add realtime event `room:member:update` (canon amendment) | Data | Accepted | — (canon §3; [docs/EVENTS.md](../docs/EVENTS.md) §5.3/§5.11) | B5 / PERM OQ-3: member-state change (mute/timeout/role) without join/leave; `room` namespace, **S→C only**, no ack, ordered per-topic by `meta.seq`, buffered in resume ring. | Historian Engineer |
| CA-006 | 2026-06-27 | Add per-room field `playlistAuthority` (canon amendment; DB rename `syncAuthorityPlaylist` → `playlistAuthority`) | Data | Accepted | — (canon §6; [docs/DATABASE.md](../docs/DATABASE.md) §3 `RoomSettings`) | B6 / PERM OQ-5: first-class `SyncAuthority`-typed field independent of `syncAuthority`; gates `room:playlist:*` for Members (Owner/Mod bypass; Members also blocked when `playlistLock=on`). Canonical name = `playlistAuthority`. | Historian Engineer |
| CA-007 | 2026-06-27 | `chatLock=on` suppresses **both Guest and Member** chat (canon amendment) | Data | Accepted | — (canon §6; [docs/PERMISSIONS.md](../docs/PERMISSIONS.md) §3.2/§9) | PERM OQ-1: Discord lock semantics; Owner/Mod exempt; below-Mod sends rejected with `CHAT_LOCKED`. | Historian Engineer |

### Process

| id | date | decision | category | status | adr | rationale | owner |
|---|---|---|---|---|---|---|---|
| D-012 | 2026-06-27 | Process-discipline ADR (plan-before-code mandate, R1–R5) | Process | Proposed — Deferred-to-Phase-1 | [ADR-012](../adr/ADR-012-process-discipline.md) (to author Phase 1) | PROC-1: renumbered from the originally-floated ADR-011 (now the backplane). Mandate already canonized in §10 + captured by L-001/L-002; formal ADR deferred. | Chief Architect |

> **Repomix:** regeneration is **deferred — pending first code** (PROC-3). No source exists yet, so there is nothing to pack; recorded here and in the repomix note. Repomix will be generated when the first Phase-1 source lands.

### Implementation decisions (Phase 1 — Slice 1, 2026-06-27)

| id | date | decision | category | status | rationale | owner |
|---|---|---|---|---|---|---|
| IMPL-001 | 2026-06-27 | Argon2id password hashing via `@node-rs/argon2` (prebuilt binaries) | Impl | Accepted | Avoids node-gyp/native build friction on Windows; OWASP-aligned params (19 MiB / t=2 / p=1). Implements ADR-008 + [SECURITY.md](../docs/SECURITY.md). | Backend Engineer |
| IMPL-002 | 2026-06-27 | Opaque rotating refresh token `<sessionId>.<secret>`; only SHA-256(secret) persisted on the session's `RefreshTokenFamily` | Impl | Accepted | Locates the session without indexing the hash; reuse outside the grace window ⇒ revoke the session/family (ADR-008 reuse detection). | Backend Engineer |
| IMPL-003 | 2026-06-27 | Monorepo resolution: dev/test consume `@cowatch/*` from source (tsconfig paths / jest mapper); production `build` consumes built `dist` | Impl | Accepted | Fast inner loop without pre-building packages, while keeping a correct, runnable production build. | DevOps Engineer |
| IMPL-004 | 2026-06-27 | e2e auth flow tested against an in-memory Prisma double | Impl | Accepted (interim) | No local Docker/Atlas; the double exercises the full HTTP/DI/guard/rotation path. Real-Mongo integration (replica-set `mongodb-memory-server` or Atlas) is a Slice-2 task. | QA Engineer |

> **Repomix update (supersedes PROC-3 hold):** the first Phase-1 source has now landed, so repomix regeneration is **now applicable**. Tracked as a Slice-2 follow-up; `scripts/repomix.ps1`/`.sh` are ready to run once the app surface stabilizes.

> **PROC-2 lesson:** elevating a load-bearing "implementation detail" (the Redis backplane) to its own ADR (ADR-011) is captured as lesson [L-003](./lessons-learned.md). Only ADRs 009/010/011 are new; all B3–B6 + OQ items are history+context only.

---

_Append new dated sections below this line. Never edit historical rows except to flip `Status` to `Superseded`/`Reversed`._
