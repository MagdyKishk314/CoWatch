# Cowatch — Documentation Index

> One-line purpose: Index every document under `docs/`, give each a one-line summary, and prescribe a reading order for newcomers and AI agents recovering context.

**Status:** Living index — Phase 0 (Architecture) planning artifact
**Owner agent:** Documentation Engineer
**Last updated: 2026-06-27**

**Canon & cross-links**

- Architecture canon (single source of truth): [../context/architecture.md](../context/architecture.md)
- Repository master map: [../INDEX.md](../INDEX.md)

---

## 1. What lives here

`docs/` holds the **human-readable and per-feature documentation** for Cowatch. These documents expand the canon ([../context/architecture.md](../context/architecture.md)) into narrative, diagrams, contracts, and acceptance-level detail. They are **planning artifacts** — they describe the system to be built; no application code exists yet (Phase 0, rule R1).

> **Authority order:** On any conflict, the **canon** ([../context/architecture.md](../context/architecture.md)) wins over these docs, and the relevant **ADR** ([../adr/](../adr/)) records the decision. These docs must cite type names, event names, and route shapes from the canon verbatim.

---

## 2. Reading Order

### Track A — Orientation (everyone, first)
1. [PRD.md](PRD.md) — what the product is and must do.
2. [ARCHITECTURE.md](ARCHITECTURE.md) — how the system is shaped end to end.
3. [DOMAIN.md](DOMAIN.md) — the entities and their relationships.

### Track B — Backend & data
4. [DATABASE.md](DATABASE.md) — Prisma + MongoDB data model and indexing.
5. [API.md](API.md) — REST surface and error/response envelopes.
6. [AUTH.md](AUTH.md) — token model, sessions, OAuth, 2FA.
7. [SECURITY.md](SECURITY.md) — the security baseline and threat posture.
8. [PERMISSIONS.md](PERMISSIONS.md) — roles, permission matrix, ownership transfer.

### Track C — Realtime & media
9. [REALTIME.md](REALTIME.md) — the transport abstraction and connection lifecycle.
10. [EVENTS.md](EVENTS.md) — the realtime event catalog and payloads.
11. [SYNC.md](SYNC.md) — server-authoritative playback sync algorithm.
12. [LIVEKIT.md](LIVEKIT.md) — voice/video/screen-share integration.

### Track D — Product surfaces & delivery
13. [SOCIAL.md](SOCIAL.md) — friends, presence, DMs, notifications, activity feed.
14. [UI.md](UI.md) — UI architecture, screens, components, and state.
15. [TESTING.md](TESTING.md) — test strategy, layers, and the 90% coverage target.
16. [DEPLOYMENT.md](DEPLOYMENT.md) — Docker-first delivery across environments.

---

## 3. Document Catalog (alphabetical)

| Document | One-line summary | Primary owner | Governing ADR(s) |
|---|---|---|---|
| [API.md](API.md) | The REST API contract: `/api/v1` resources, methods, request/response and error envelopes, pagination, versioning. | Backend Engineer | [ADR-002](../adr/ADR-002-nestjs.md) |
| [ARCHITECTURE.md](ARCHITECTURE.md) | The narrative system architecture — apps, packages, data/realtime flows, deployment topology — expanding the canon. | Chief Architect | ADR-001…010 |
| [AUTH.md](AUTH.md) | Auth flows and token model: JWT access + rotating refresh, device sessions, OAuth, email verification, password reset, TOTP 2FA. | Backend Engineer | [ADR-008](../adr/ADR-008-auth.md) |
| [DATABASE.md](DATABASE.md) | The data model: Prisma-over-MongoDB conventions, collections, embed-vs-reference, denormalization, indexing, soft-delete. | Backend Engineer | [ADR-003](../adr/ADR-003-prisma.md) |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Docker-first delivery: images, compose stacks, environment targets (local/VPS/Vercel/prod), config, health, rollout. | DevOps Engineer | [ADR-010](../adr/ADR-010-docker.md) |
| [DOMAIN.md](DOMAIN.md) | The domain model in depth — entities, lifecycles, invariants, state machines, glossary expansion. | Chief Architect | — |
| [EVENTS.md](EVENTS.md) | The realtime event catalog: every `namespace:entity:action` event, direction, payload shape, and authority rules. | Realtime Engineer | [ADR-004](../adr/ADR-004-realtime.md) |
| [LIVEKIT.md](LIVEKIT.md) | Voice/video/screen-share design on LiveKit: rooms, tokens, channels (public/password), publishing, future data-channel transport. | Voice Engineer | [ADR-005](../adr/ADR-005-livekit.md) |
| [PERMISSIONS.md](PERMISSIONS.md) | Roles (`Owner`/`Moderator`/`Member`/`Guest`), the permission matrix, sync-authority modes, and ownership-transfer algorithm. | Backend Engineer | — |
| [PRD.md](PRD.md) | The product requirements — vision, users, scope, feature set, phases, success criteria. The product contract. | Chief Architect / Product | — |
| [REALTIME.md](REALTIME.md) | The custom realtime abstraction: `RealtimeTransport` interface, envelope, reconnection/resume, adapter selection. | Realtime Engineer | [ADR-004](../adr/ADR-004-realtime.md) |
| [SECURITY.md](SECURITY.md) | Security baseline: TLS, hashing, JWT/cookie posture, CSRF, rate limiting, CORS, validation, secrets, least-privilege storage. | DevOps / Backend | [ADR-008](../adr/ADR-008-auth.md) |
| [SOCIAL.md](SOCIAL.md) | The social graph: friends/requests, presence, DMs, blocks, activity feed, notifications and their types. | Social Engineer | [ADR-004](../adr/ADR-004-realtime.md) |
| [SYNC.md](SYNC.md) | The server-authoritative playback sync algorithm: clock model, heartbeat, drift correction, what is/isn't synced. | Media Engineer | [ADR-007](../adr/ADR-007-sync.md) |
| [TESTING.md](TESTING.md) | The test strategy: unit/integration/e2e layers, fixtures, realtime/sync testing, and the 90% coverage target. | QA Engineer | — |
| [UI.md](UI.md) | The frontend architecture: screens, navigation, component inventory, Zustand stores, TanStack Query usage, design system. | Frontend Engineer | [ADR-006](../adr/ADR-006-electron.md) |

> **Note on ADR-009/010:** [ADR-009 (MinIO storage)](../adr/ADR-009-minio.md) and [ADR-010 (Docker-first)](../adr/ADR-010-docker.md) are referenced by the canon and by [DEPLOYMENT.md](DEPLOYMENT.md)/[SECURITY.md](SECURITY.md). Their ADR files are planned and may be added after the Phase 0 batch; until then, the canon §2 entries are authoritative.

---

## 4. How these docs relate to other areas

- **Specs vs docs:** `docs/` explains and contracts the system as a whole; [../specs/](../specs/) holds the per-feature specifications that gate a feature's tasks/tests/code (R5). A feature spec links back to the relevant doc(s) here.
- **ADRs vs docs:** [../adr/](../adr/) records *why* a decision was made; docs here record *what* and *how*. Each doc cites its governing ADR(s).
- **Canon vs docs:** [../context/architecture.md](../context/architecture.md) is the immutable-by-process source of truth; docs comply with it.

---

## 5. Contributing to docs

1. Start every doc with the standard header block (title H1, one-line purpose, Status, Owner agent, `Last updated:` line).
2. Cross-link siblings and the canon with **relative** markdown links.
3. Cite type/event/route names **verbatim** from the canon.
4. Add the new document to the catalog table and the reading order in this file in the same change.
5. If the change alters architecture, also produce an ADR + history entry + context update + repomix update (R3).

---

_Maintained by the Documentation Engineer. Last updated 2026-06-27._
