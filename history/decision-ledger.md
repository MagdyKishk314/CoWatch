# Decision Ledger

> Append-only, chronological ledger of every architectural and process-level decision made on the Cowatch platform.

**Status:** Living (append-only)
**Owner agent:** Historian Engineer
**Last updated: 2026-06-27**

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
- **Storage/deploy split:** D-009 (MinIO) and D-010 (Docker) are recorded as distinct decisions per the assignment ("the 8 ADRs + storage + deploy"). If MinIO and Docker are ever consolidated into an infrastructure ADR, supersede both rows rather than editing them.

---

_Append new dated sections below this line. Never edit historical rows except to flip `Status` to `Superseded`/`Reversed`._
