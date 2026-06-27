# Cowatch

> A production SaaS, Discord-like social watch-party platform — create rooms, watch synchronized media together (YouTube first), chat, voice/video, and maintain a social graph (friends, presence, DMs, notifications).

**Status:** Planning (Phase 0 — Architecture)
**Owner agent:** DevOps / Chief Architect
**Last updated: 2026-06-27**

---

> [!IMPORTANT]
> ## Recovering context?
> If you are an AI agent or a human picking this project back up after a break, **read [`context/RESTORE_CONTEXT.md`](context/RESTORE_CONTEXT.md) first.**
> It is the single entry point that restores you to a working mental model: where we are in the phase plan, what is in flight, and which documents to read in what order. The project is designed to be **fully recoverable** at any point despite AI context-window exhaustion (process rule R2).

---

## What is Cowatch?

Cowatch lets people watch media **together, in sync, in real time**. A room owner queues YouTube videos; everyone in the room sees the same frame at the same moment (server-authoritative clock, target drift **< 500 ms**). Around the shared player sits a full social layer — text chat with reactions and GIFs, LiveKit-backed voice/video/screen-share channels, friends, presence, direct messages, and notifications.

It ships as:

- a **web app** (React + Vite),
- an **Electron desktop app** (picture-in-picture, push notifications, auto-update, hardware acceleration), and
- a **marketing landing site**.

The backend is **NestJS** (REST + WebSocket gateways) over **MongoDB via Prisma**, with a **custom realtime abstraction layer** whose transport is replaceable (native WebSocket today; serverless adapters later). Voice/video runs on **LiveKit**; object storage on **MinIO**; everything is **Docker-first**.

See the [Architecture Canon](context/architecture.md) for the binding single source of truth, and [`docs/PRD.md`](docs/PRD.md) for the product requirements.

---

## Documentation-first philosophy

Cowatch is built **planning-first**. No application code is written until its planning artifacts exist. This is not bureaucracy — it is the mechanism that makes the project recoverable and keeps a multi-agent team internally consistent.

The non-negotiable process rules:

| Rule | Meaning |
|------|---------|
| **R1 — Plan before code** | Produce all planning artifacts first. Do not implement the app during Phase 0. |
| **R2 — Full recoverability** | The project must be resumable at any point despite AI context-window exhaustion. State lives in [`project-state/`](project-state/) and [`context/`](context/). |
| **R3 / R4 — Architecture is traceable** | Every architectural decision creates an **ADR** + **history** entry + **context** update + **repomix** update. Architecture never changes without all four. |
| **R5 — Every feature is specified** | Each feature has a **spec → tasks → tests → docs → (ADR if needed)** before any code. Coverage target **90%**. |

**Per-feature workflow:** `spec → tasks → tests → docs → ADR (if needed) → implement → test → update history → update context → update repomix → update project-state`.

The [Architecture Canon](context/architecture.md) is the **single source of truth**. On any conflict between a downstream document and the canon, the canon wins; changing the canon requires an ADR + history entry + context update + repomix update.

---

## Repository map

```
cowatch/
├── apps/
│   ├── web/        # React + Vite + Tailwind + shadcn/ui + Zustand + TanStack Query
│   ├── desktop/    # Electron + electron-builder (wraps the web app)
│   ├── server/     # NestJS (REST + WS gateways) — src/modules/<context>/
│   └── landing/    # Marketing site
├── packages/
│   ├── ui/         # Shared shadcn/Radix components
│   ├── auth/       # Token/session client + guard helpers
│   ├── database/   # Prisma schema + generated client re-export
│   ├── realtime/   # RealtimeTransport interface + envelope + adapters
│   ├── social/     # Friends/presence/DM shared logic
│   ├── sdk/        # Typed API client (consumes packages/types)
│   ├── shared/     # Cross-cutting utils (ids, errors, config)
│   └── types/      # Canonical TS domain + DTO + event types (SOURCE OF TRUTH for types)
├── adr/            # ADR-NNN-*.md — architecture decision records
├── context/        # architecture.md (CANON), RESTORE_CONTEXT.md, domain/glossary notes
├── docs/           # Human docs, per-feature documentation
├── specs/          # Per-feature specifications
├── tasks/          # Implementation task lists
├── history/        # Append-only decision/change log (R3)
├── project-state/  # Recoverable phase/progress state (R2)
├── repomix/        # Packed repo snapshots
├── docker/         # Dockerfiles + compose stacks
├── instructions/   # Agent role instructions
├── prompts/        # Reusable prompts
└── scripts/        # Tooling/automation scripts
```

### Key documents

- **[Architecture Canon](context/architecture.md)** — binding single source of truth.
- **[Restore context](context/RESTORE_CONTEXT.md)** — start here when resuming.
- **[Product requirements](docs/PRD.md)** · **[Architecture](docs/ARCHITECTURE.md)** · **[Domain model](docs/DOMAIN.md)**
- **[API](docs/API.md)** · **[Realtime events](docs/EVENTS.md)** · **[Realtime layer](docs/REALTIME.md)** · **[Sync](docs/SYNC.md)**
- **[Auth](docs/AUTH.md)** · **[Permissions](docs/PERMISSIONS.md)** · **[Security](docs/SECURITY.md)** · **[Database](docs/DATABASE.md)**
- **[Social](docs/SOCIAL.md)** · **[LiveKit](docs/LIVEKIT.md)** · **[UI](docs/UI.md)** · **[Testing](docs/TESTING.md)** · **[Deployment](docs/DEPLOYMENT.md)**
- **[ADRs](adr/)** — every architecture decision (ADR-001 … ADR-010).

---

## Tech stack at a glance

| Layer | Choice | ADR |
|-------|--------|-----|
| Monorepo | Turborepo + pnpm workspaces | [ADR-001](adr/ADR-001-monorepo.md) |
| Backend | NestJS (REST + WS + JWT + OAuth) — **no Express as app framework** | [ADR-002](adr/ADR-002-nestjs.md) |
| Database | Prisma ORM over MongoDB | [ADR-003](adr/ADR-003-prisma.md) |
| Realtime | Custom transport abstraction (native WS default) | [ADR-004](adr/ADR-004-realtime.md) |
| Voice/Video | LiveKit (SFU) | [ADR-005](adr/ADR-005-livekit.md) |
| Desktop | Electron + electron-builder | [ADR-006](adr/ADR-006-electron.md) |
| Playback sync | Server-authoritative clock (< 500 ms drift) | [ADR-007](adr/ADR-007-sync.md) |
| Auth | JWT access + rotating refresh, device sessions, TOTP 2FA | ADR-008 |
| Storage | MinIO (S3-compatible) | ADR-009 |
| Delivery | Docker-first across local / VPS / Vercel / production | ADR-010 |

**Frontend:** React, TypeScript, Vite, TailwindCSS, shadcn/ui, Radix UI, Framer Motion, Zustand, TanStack Query.

---

## Quickstart

> [!NOTE]
> **Placeholder — Phase 0 (Planning).** Application scaffolding does not exist yet. The commands below describe the intended developer experience and will become live in the implementation phase. See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the Docker-first topology.

**Prerequisites**

- Node `>= 22` (see [`.nvmrc`](.nvmrc) — run `nvm use`)
- pnpm `>= 9` (`corepack enable` activates the pinned version from `package.json`)
- Docker + Docker Compose (for MongoDB, MinIO, LiveKit, Redis)

**Get started (intended)**

```bash
# 1. Install the workspace
corepack enable
pnpm install

# 2. Bring up backing services (MongoDB, MinIO, LiveKit, Redis)
docker compose -f docker/compose.dev.yml up -d

# 3. Run the full dev pipeline (all apps, via Turborepo)
pnpm dev

# Useful pipelines (all delegate to turbo)
pnpm build       # build every app + package, respecting the dependency graph
pnpm lint        # lint all workspaces
pnpm typecheck   # strict TypeScript project-wide
pnpm test        # run all test suites (coverage target 90%)
```

---

## Status & roadmap

Cowatch is in **Phase 0 (Architecture)**. The development phases:

`0 Architecture` → `1 Authentication` → `2 Rooms` → `3 YouTube Sync` → `4 Chat` → `5 Friends` → `6 Notifications` → `7 Discovery` → `8 Voice` → `9 Video` → `10 Electron` → `11 Testing` → `12 Deployment`.

Live progress lives in [`project-state/current-phase.md`](project-state/current-phase.md). Decisions are logged in [`history/decision-ledger.md`](history/decision-ledger.md).

---

## Contributing & conventions

All naming, routing, event, schema, and type conventions are fixed by the [Architecture Canon](context/architecture.md). Before adding anything, confirm it complies — type names, realtime event names, and REST route shapes must match the canon **verbatim**. Editor and Node defaults are pinned via [`.editorconfig`](.editorconfig) and [`.nvmrc`](.nvmrc); TypeScript strictness is shared via [`tsconfig.base.json`](tsconfig.base.json).
