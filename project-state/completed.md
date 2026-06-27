# Project State — Completed Work

> Append-only log of completed deliverables, newest first.
> **Status:** Phase 0 planning artifacts complete; Phase-0 open-questions punch-list cleared.
> **Owner agent:** Historian / PM
> Last updated: 2026-06-27

> Amended 2026-06-27: added the open-questions remediation deliverable (ADR backfills/ADR-011 + canon amendments).

---

## Phase 0 — Open-Questions Remediation — 2026-06-27

Cleared the Phase-0 open-questions punch-list under the Chief Architect's binding resolutions
([open-questions.md](./open-questions.md)). Planning only — no application code (R1). Recorded
per R3/R4 in [history/decision-ledger.md](../history/decision-ledger.md) (2026-06-27 remediation
section) and [history/migrations.md](../history/migrations.md).

- [x] Backfilled [ADR-009 — MinIO object storage](../adr/ADR-009-minio-storage.md) and [ADR-010 — Docker-first delivery](../adr/ADR-010-docker-first.md) to ratify existing canon (no decision change) — B1.
- [x] Authored [ADR-011 — Realtime backplane (Redis pub/sub + Streams)](../adr/ADR-011-realtime-backplane.md); ledger row **D-011** added — B2.
- [x] Ledger canon-amendment rows for new collections `room_bans`, `join_requests`, `activity_events` (and confirmation of `role_assignments`, `votes`) — B3/B4.
- [x] Ledger canon-amendment row for realtime event `room:member:update` (S→C) — B5.
- [x] Ledger canon-amendment row for per-room field `playlistAuthority` (DB rename `syncAuthorityPlaylist` → `playlistAuthority`) — B6.
- [x] Lesson [L-003](../history/lessons-learned.md) recorded on the parallel-authoring Open-Questions discipline.
- [x] Process-discipline ADR renumbered to **ADR-012 / D-012** (Deferred-to-Phase-1) — PROC-1.
- [x] Repomix regeneration noted as **deferred — pending first code** (PROC-3); not run.

> Schema/index/model detail (Prisma models, indexes, TTLs) and canon §2/§3/§5/§6 edits are
> authored by the Backend/Data and Canon agents; entries here track the history + project-state
> deliverables this team owns.

---

## Phase 0 — Architecture (planning) — 2026-06-27

Planning/design artifacts only; no application code (R1).

### Canon & context

- [x] [context/architecture.md](../context/architecture.md) — Architecture Canon (single source of truth)
- [x] Domain glossary + naming conventions (in canon §1, §3)

### Architecture Decision Records

- [x] [ADR-001 — Monorepo (Turborepo + pnpm)](../adr/ADR-001-monorepo-turborepo-pnpm.md)
- [x] [ADR-002 — NestJS backend](../adr/ADR-002-nestjs-backend.md)
- [x] [ADR-003 — Prisma over MongoDB](../adr/ADR-003-prisma-mongodb.md)
- [x] [ADR-004 — Custom realtime abstraction](../adr/ADR-004-realtime-abstraction.md)
- [x] [ADR-005 — LiveKit voice/video](../adr/ADR-005-livekit-voice.md)
- [x] [ADR-006 — Electron desktop](../adr/ADR-006-electron-desktop.md)
- [x] [ADR-007 — Server-authoritative sync](../adr/ADR-007-server-authoritative-sync.md)
- [x] [ADR-008 — Auth & token model](../adr/ADR-008-auth-tokens.md)
- [x] [ADR-009 — MinIO object storage](../adr/ADR-009-minio-storage.md)
- [x] [ADR-010 — Docker-first delivery](../adr/ADR-010-docker-first.md)

### Specs, tasks, tests, docs (R5 — Phase 1 ready)

- [x] [specs/auth.spec.md](../specs/auth.spec.md) — Authentication specification + acceptance criteria
- [x] [docs/PHASES.md](../docs/PHASES.md) — development phase plan (0–12)
- [x] [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) — human-facing architecture overview
- [x] Phase 1 implementation task list (`tasks/`)
- [x] Phase 1 test plan + acceptance criteria

### Project state (R2 — recoverability)

- [x] [current-phase.md](./current-phase.md)
- [x] [current-task.md](./current-task.md)
- [x] [next-task.md](./next-task.md)
- [x] [blockers.md](./blockers.md)
- [x] [completed.md](./completed.md)
- [x] [known-bugs.md](./known-bugs.md)
- [x] [tech-debt.md](./tech-debt.md)

> Note: This file tracks the planning deliverables this team produced. Some siblings above
> are authored by other planning agents; entries are checked when the artifact exists at its
> canonical path. If an entry is unchecked at restore time, that artifact is still pending.

---

### Entry template (future phases)

```
## Phase N — <name> — YYYY-MM-DD
- [x] <artifact or feature> — [link](<relative-path>)
```
