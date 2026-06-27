# Cowatch — Repository Index

> One-line purpose: The master navigation map of the entire Cowatch monorepo — every top-level area, what it holds, and the canonical entry points to start reading from.

**Status:** Living index — Phase 0 (Architecture) planning artifact
**Owner agent:** Documentation Engineer
**Last updated: 2026-06-27**

---

## 0. Start Here (canonical entry points)

If you are a human or an AI agent recovering context, read these in order:

| # | Entry point | What it gives you |
|---|---|---|
| 1 | [context/architecture.md](context/architecture.md) | **CANON** — the single source of truth. Every other artifact complies with it; on any conflict, canon wins. |
| 2 | [docs/PRD.md](docs/PRD.md) | The product contract — what Cowatch is, who it serves, and what it must do. |
| 3 | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | The narrative system architecture expanding the canon into diagrams and component maps. |
| 4 | [project-state/current-phase.md](project-state/current-phase.md) | **RESTORE_CONTEXT** — recoverable phase/progress snapshot for fast context restore (R2). |
| 5 | [docs/README.md](docs/README.md) | The full documentation index with reading order. |

> **Planned entry points (not yet created):** a consolidated `RESTORE_CONTEXT.md`, `PHASES.md`, and `ROADMAP.md` are planned at the repo root to aggregate the `project-state/` snapshots and the 0–12 phase plan. Until they land, use the linked existing artifacts above (the `project-state/` files collectively serve the RESTORE_CONTEXT role, and the phase plan lives in [docs/PRD.md](docs/PRD.md) and [project-state/current-phase.md](project-state/current-phase.md)).

---

## 1. What is Cowatch?

Cowatch is a production SaaS, Discord-like **social watch-party platform**: users create rooms, watch synchronized media together (YouTube first), chat, talk over voice/video/screen-share, and maintain a social graph (friends, presence, DMs, notifications). It ships as a **web app**, an **Electron desktop app**, and a **marketing landing site**, all served from a single Turborepo + pnpm monorepo with a NestJS backend on Prisma + MongoDB and a custom replaceable realtime transport.

> **Planning-phase notice:** This repository is currently in **Phase 0 (Architecture)**. The `apps/*` and `packages/*` directories contain **planning READMEs and design artifacts only** — no application code has been implemented yet (process rule R1: plan before code). Each placeholder README states its planned tech and contents.

---

## 2. Repository Map

```
cowatch/
├── INDEX.md                  # ← you are here: master navigation map
├── apps/                     # Deployable applications (4)
│   ├── web/                  # React + Vite SPA — the primary client          [Frontend Engineer]
│   ├── desktop/              # Electron shell wrapping the web app             [Electron Engineer]
│   ├── server/               # NestJS REST + WebSocket backend                 [Backend Engineer]
│   └── landing/              # Marketing landing site                         [Frontend Engineer]
├── packages/                 # Shared workspace packages (8)
│   ├── ui/                   # Shared shadcn/Radix component library           [Frontend Engineer]
│   ├── auth/                 # Token/session client + guard helpers            [Backend Engineer]
│   ├── database/             # Prisma schema + generated client re-export      [Backend Engineer]
│   ├── realtime/             # RealtimeTransport interface + envelope + adapters [Realtime Engineer]
│   ├── social/              # Friends/presence/DM shared logic                [Social Engineer]
│   ├── sdk/                  # Typed API client (consumes packages/types)      [Backend Engineer]
│   ├── shared/               # Cross-cutting utils (ids, errors, config)       [Chief Architect]
│   └── types/                # Canonical TS domain + DTO + event types (SOURCE OF TRUTH) [Chief Architect]
├── docs/                     # Human + per-feature documentation (see docs/README.md)
├── adr/                      # Architecture Decision Records (ADR-NNN-*.md)    [Chief Architect]
├── history/                  # Append-only decision/change log (R3)            [Historian Engineer]
├── instructions/             # Agent role instructions + working agreements
├── tasks/                    # Per-feature implementation task lists (R5)
├── prompts/                  # Reusable agent prompt templates
├── context/                  # architecture.md (CANON), domain notes, glossary [Chief Architect]
├── project-state/            # Recoverable phase/progress state (R2)           [Historian Engineer]
├── repomix/                  # Packed repo snapshots for context windows (R4)  [Historian Engineer]
├── specs/                    # Per-feature specifications (R5)
├── scripts/                  # Build/dev/ops automation scripts                [DevOps Engineer]
└── docker/                   # Dockerfiles + compose for local/VPS/prod        [DevOps Engineer]
```

---

## 3. Top-Level Areas — One-Line Descriptions

### Applications — `apps/`

| Area | One-line description | Owning agent | README |
|---|---|---|---|
| `apps/web` | React + TypeScript + Vite + Tailwind + shadcn/ui + Zustand + TanStack Query SPA — the primary Cowatch client (rooms, player, chat, voice, social). | Frontend Engineer | [apps/web/README.md](apps/web/README.md) |
| `apps/desktop` | Electron + electron-builder native shell wrapping the web app, adding PiP, push notifications, HW accel, auto-update, and IPC. | Electron Engineer | [apps/desktop/README.md](apps/desktop/README.md) |
| `apps/server` | NestJS backend: REST (`/api/v1`) + WebSocket gateways + JWT/OAuth + Prisma, organized one module per bounded context. | Backend Engineer | [apps/server/README.md](apps/server/README.md) |
| `apps/landing` | Public marketing landing site — value proposition, feature tour, sign-up funnel. | Frontend Engineer | [apps/landing/README.md](apps/landing/README.md) |

### Packages — `packages/`

| Area | One-line description | Owning agent | README |
|---|---|---|---|
| `packages/ui` | Shared shadcn/ui + Radix + Tailwind component library consumed by web, desktop, and landing. | Frontend Engineer | [packages/ui/README.md](packages/ui/README.md) |
| `packages/auth` | Client-side token/session helpers and NestJS guard helpers implementing the ADR-008 token model. | Backend Engineer | [packages/auth/README.md](packages/auth/README.md) |
| `packages/database` | Owns `prisma/schema.prisma` (the data model) and re-exports the generated Prisma client. | Backend Engineer | [packages/database/README.md](packages/database/README.md) |
| `packages/realtime` | The custom realtime abstraction (ADR-004): `RealtimeTransport`, the message envelope, and transport adapters. | Realtime Engineer | [packages/realtime/README.md](packages/realtime/README.md) |
| `packages/social` | Shared friends / presence / DM / notification domain logic used by client and server. | Social Engineer | [packages/social/README.md](packages/social/README.md) |
| `packages/sdk` | Typed API client wrapping every REST + realtime contract, consuming `packages/types`. | Backend Engineer | [packages/sdk/README.md](packages/sdk/README.md) |
| `packages/shared` | Cross-cutting utilities: ULID/ObjectId helpers, error envelope, config loading, constants. | Chief Architect | [packages/shared/README.md](packages/shared/README.md) |
| `packages/types` | **Source of truth for TypeScript types** — domain entities, DTOs, and realtime event payloads. Never duplicated. | Chief Architect | [packages/types/README.md](packages/types/README.md) |

### Knowledge & Process areas

| Area | One-line description | Owning agent |
|---|---|---|
| `docs/` | Human-readable + per-feature documentation (PRD, architecture, auth, sync, social, security, testing, deployment, …). Indexed by [docs/README.md](docs/README.md). | Documentation Engineer |
| `adr/` | Architecture Decision Records, one file per decision (`adr/ADR-NNN-kebab-title.md`). No architecture change ships without one (R3). | Chief Architect |
| `history/` | Append-only decision ledger, breaking changes, migrations, mistakes, lessons learned, technical debt (R3). | Historian Engineer |
| `instructions/` | Agent role instructions, working agreements, and process discipline notes. | Chief Architect |
| `tasks/` | Per-feature implementation task lists with acceptance criteria — produced before any coding (R5). | Documentation Engineer |
| `prompts/` | Reusable, versioned agent prompt templates for repeatable planning/build workflows. | Chief Architect |
| `context/` | **CANON** ([architecture.md](context/architecture.md)) plus domain/business/realtime context notes — the single source of truth. | Chief Architect |
| `project-state/` | Recoverable phase/progress snapshots (current phase, current/next task, completed, blockers, known bugs, tech debt) for context restore (R2). | Historian Engineer |
| `repomix/` | Packed repository snapshots that fit large bodies of context into a single file for AI context windows (R4). | Historian Engineer |
| `specs/` | Per-feature specifications — the contract a feature must satisfy before tasks/tests/code (R5). | Documentation Engineer |
| `scripts/` | Build, dev, lint, codegen, and ops automation scripts orchestrated by Turborepo + pnpm. | DevOps Engineer |
| `docker/` | Dockerfiles and compose stacks for local / VPS / Vercel / production parity (ADR-010, Docker-first). | DevOps Engineer |

---

## 4. Find It Fast — Task → Document Routing

| If you want to… | Read |
|---|---|
| Understand the product and scope | [docs/PRD.md](docs/PRD.md) |
| Understand the system shape | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) + [context/architecture.md](context/architecture.md) (canon) |
| Implement auth / tokens / sessions | [docs/AUTH.md](docs/AUTH.md), [docs/SECURITY.md](docs/SECURITY.md), [adr/ADR-008-auth.md](adr/ADR-008-auth.md) |
| Model data / write Prisma schema | [docs/DATABASE.md](docs/DATABASE.md), [docs/DOMAIN.md](docs/DOMAIN.md), [adr/ADR-003-prisma.md](adr/ADR-003-prisma.md) |
| Build realtime / WebSocket features | [docs/REALTIME.md](docs/REALTIME.md), [docs/EVENTS.md](docs/EVENTS.md), [adr/ADR-004-realtime.md](adr/ADR-004-realtime.md) |
| Implement YouTube sync | [docs/SYNC.md](docs/SYNC.md), [adr/ADR-007-sync.md](adr/ADR-007-sync.md) |
| Wire voice/video/screen-share | [docs/LIVEKIT.md](docs/LIVEKIT.md), [adr/ADR-005-livekit.md](adr/ADR-005-livekit.md) |
| Reason about roles & permissions | [docs/PERMISSIONS.md](docs/PERMISSIONS.md) |
| Build friends/presence/DM/notifications | [docs/SOCIAL.md](docs/SOCIAL.md) |
| Call the API | [docs/API.md](docs/API.md) |
| Build UI | [docs/UI.md](docs/UI.md) |
| Ship the Electron app | [adr/ADR-006-electron.md](adr/ADR-006-electron.md), [apps/desktop/README.md](apps/desktop/README.md) |
| Deploy | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), [docker/](docker/) |
| Write/run tests | [docs/TESTING.md](docs/TESTING.md) |
| Recover lost context | [project-state/current-phase.md](project-state/current-phase.md) + [history/decision-ledger.md](history/decision-ledger.md) |

---

## 5. Conventions Recap (full detail in canon §3)

- **Files**: `kebab-case.ts`; NestJS suffixes mandatory (`.module.ts`, `.controller.ts`, `.service.ts`, `.gateway.ts`, `.dto.ts`, …). React `PascalCase.tsx`, hooks `useCamelCase.ts`, stores `camelCase.store.ts`.
- **REST**: versioned, plural, kebab, nested — base `/api/v1`. Verbs never in paths.
- **Realtime events**: `namespace:entity:action` (e.g. `playback:sync`, `room:member:join`).
- **Collections**: `snake_case` plural (`queue_items`, `friend_requests`).
- **Types**: `PascalCase`, no `I` prefix; canonical home is `packages/types`.

See the canon for the authoritative rules: [context/architecture.md#3-naming-conventions](context/architecture.md#3-naming-conventions).

---

## 6. Process Discipline (R2–R5)

Planning artifacts precede code. Every architectural change ⇒ **ADR + history entry + context update + repomix update**. Every feature ⇒ **spec → tasks → tests → docs → (ADR) → implement → test → history → context → repomix → project-state**. Coverage target **90%**. Full rules: [context/architecture.md#10-cross-cutting-non-negotiables](context/architecture.md#10-cross-cutting-non-negotiables).

---

_This index is maintained by the Documentation Engineer. When a top-level area is added or renamed, update this file in the same change._
