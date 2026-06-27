# ADR-003 — Prisma ORM over MongoDB (references + denormalization)

> Use **Prisma** as the typed data-access layer over a **MongoDB** document store, modeling the domain document-first with references and denormalized read-hot snapshots — not relational normalization.

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-06-27 |
| **Deciders** | Chief Architect (owner), Backend Engineer, DevOps Engineer |
| **Related ADRs** | [ADR-002 — NestJS backend](./ADR-002-nestjs.md), [ADR-001 — Turborepo + pnpm](./ADR-001-monorepo.md), [ADR-009 — MinIO object storage](./ADR-009-minio.md) |
| **Canon** | [Architecture Canon §3 Naming](../context/architecture.md#3-naming-conventions), [§4 Data-Modeling Conventions](../context/architecture.md#4-data-modeling-conventions-mongodb--prisma) |
| **Supersedes** | — |
| **Last updated** | 2026-06-27 |

---

## Context / Problem

Cowatch is a Discord-like watch-party SaaS. Its data is overwhelmingly **document-shaped** and **read-heavy on hot paths**: a room loads with its settings + embedded playback authority config, a chat channel streams an unbounded log of messages, a discovery grid renders thousands of rooms by `(visibility, isActive)` with denormalized `currentVideoTitle`/`viewerCount`, and a notification feed is paged by `(userId, readAt, createdAt)`. The SPEC is explicit: **"MongoDB via Prisma; prefer document references and denormalization; avoid relational thinking."** The canon ([§4](../context/architecture.md#4-data-modeling-conventions-mongodb--prisma)) hard-codes the ObjectId strategy, embed-vs-reference rules, a denormalization policy with named snapshot fields, mandatory compound indexes, and soft-delete via `deletedAt`.

We need a persistence layer that gives us:

1. **End-to-end type safety** across a TypeScript monorepo — the Prisma schema must be the *single owner* of the data model (canon §4), with the generated client re-exported through `packages/database` and domain types living in `packages/types`. No hand-maintained schema/type drift.
2. **A document-native data model** — embeds for owned/bounded children (room `settings`, message `reactions`, session device metadata), references for unbounded/shared collections (`messages`, `queue_items`, `memberships`, `notifications`), and first-class **denormalization** as a *deliberate* modeling choice, not an anti-pattern to fight.
3. **A migration / schema-evolution workflow** that a multi-agent team can run reproducibly inside Docker (ADR-010), reviewable in PRs, recoverable after context loss (R2).
4. **Operational portability** — self-hostable on a VPS today, cloud-portable later, with no proprietary query language leaking into NestJS services.

The decision is which **data-access technology** sits between the NestJS modules (canon §3) and the database. This is foundational: it dictates how every bounded-context module (`RoomsModule`, `ChatModule`, `PlaybackModule`, …) reads and writes, and it is expensive to reverse once 14 collections and dozens of services depend on it. Getting the embed/reference/denormalization ergonomics right matters more than raw driver throughput, because the bottlenecks here are index design and fan-out, not the client library.

---

## Options Considered

### Option A — Prisma ORM over MongoDB *(chosen)*

Prisma's MongoDB connector with a schema-first model: `schema.prisma` declares models with `@@map` to `snake_case` plural collections, `id String @id @default(auto()) @map("_id") @db.ObjectId`, embedded **composite types** for owned children, and explicit `@@index` declarations.

- **Pros:** Generated, fully-typed client (autocomplete + compile-time safety) consumed across the whole monorepo; one schema file is the single source of truth (canon §4); composite types model embeds natively; declarative indexes live in-schema and are reviewable; clean async API with built-in connection pooling; Prisma Studio + `prisma db push` aid the recoverability mandate (R2); transports no query language into services.
- **Cons:** MongoDB connector is **less mature** than Prisma's SQL connectors — no `prisma migrate` (uses `db push` instead, so no migration history file), partial aggregation-pipeline coverage, some advanced Mongo operators only reachable via `$runCommandRaw`/`findRaw`; an extra codegen step; multi-document transactions require a replica set.

### Option B — Mongoose (ODM)

The incumbent Node.js MongoDB ODM: schema objects, models, middleware/hooks, populate-based references, full aggregation support.

- **Pros:** Mongo-native and battle-tested; complete aggregation-pipeline and operator coverage; rich hooks/virtuals/validators; `populate` handles references; huge ecosystem and NestJS first-class integration (`@nestjs/mongoose`).
- **Cons:** **Type safety is bolted-on**, not generated — schemas and TS interfaces are maintained in parallel and *drift*, directly violating the canon's "single owner of the data model" rule and the `packages/types` non-duplication rule; runtime schema validation instead of compile-time; `populate` invites the relational join-thinking the SPEC tells us to avoid; more boilerplate per model.

### Option C — Native MongoDB driver (`mongodb`)

Use the official driver directly, with hand-written repository classes per collection.

- **Pros:** Zero abstraction overhead and maximum performance; complete, immediate access to every Mongo feature (aggregation, change streams, bulk ops, transactions); no codegen or ORM version lag; smallest dependency surface.
- **Cons:** **No type safety, no schema, no validation** out of the box — every collection shape, index, and denorm rule is enforced only by convention and code review; enormous boilerplate (CRUD + projection + index management per collection) across 14 collections; no single-source-of-truth schema (fails canon §4 and R2 recoverability); easiest option to introduce inconsistency in a multi-agent team.

### Option D — PostgreSQL + Prisma (relational)

Prisma's mature SQL path on Postgres, with `jsonb` columns for the document-shaped parts.

- **Pros:** Prisma's **most mature** connector — real `prisma migrate` with versioned migration history, full relational integrity, transactions, and the richest tooling; excellent type safety; `jsonb` can hold embeds.
- **Cons:** **Contradicts the SPEC and ADR-003's mandate** ("MongoDB via Prisma … avoid relational thinking"); the domain is document-shaped — forcing it into normalized tables fights the model (chat reactions, room settings, playback config, session metadata all want to be embedded docs); denormalization-for-read-speed becomes awkward `jsonb` + trigger maintenance; loses Mongo's horizontal-scaling and document-locality story; an architecture-level reversal requiring a different ADR entirely.

> Options A and B are Mongo-native; C trades all safety for control; D abandons the document model. The decision weighs **type-safety + single-source-of-truth** (A, D) against **Mongo feature-completeness** (B, C) against **SPEC alignment** (A, B, C are Mongo; D is not).

---

## Decision

**Adopt Prisma ORM over MongoDB (Option A).** The Prisma schema at `packages/database/prisma/schema.prisma` is the **single owner of the data model**; the generated client is re-exported through `packages/database` and consumed by every NestJS module. Domain/DTO/event types in `packages/types` remain the canonical TS source of truth and are kept in lockstep with the Prisma models (canon §3, §4).

Modeling rules (binding, from canon §4):

- **Ids:** `id String @id @default(auto()) @map("_id") @db.ObjectId`; every foreign key is `String @db.ObjectId`; **ids are strings everywhere in TS** — `ObjectId` instances never cross the service boundary.
- **Collections:** `snake_case` plural via `@@map` — `users`, `sessions`, `rooms`, `memberships`, `playlists`, `queue_items`, `messages`, `dm_threads`, `notifications`, `voice_channels`, `friendships`, `friend_requests`, `blocks`, `invite_links`.
- **Embed** owned/bounded/read-with-parent children as Prisma **composite types**: room `settings`, playback authority config, message `reactions` (capped), session device metadata.
- **Reference** unbounded/shared/independently-queried children with a back-reference id + index: `messages → room`, `queue_items → playlist`, `memberships → user/room`, `notifications → user`. **Never embed an unbounded growing list.**
- **Denormalize** the canon's named read-hot snapshots — `Membership.userDisplayName/userAvatarUrl`, `Room.ownerId/ownerDisplayName`, `Message.authorDisplayName/authorAvatarUrl`, `QueueItem.addedByDisplayName`, `Room.currentVideoTitle` + `Room.viewerCount`. These are **eventually consistent**; the owning aggregate is the source of truth and re-fans updates via realtime + background reconciliation. Each denormalized field is documented at its definition with its source.
- **Indexes** declared in-schema: `memberships (roomId, userId)` unique, `messages (roomId, createdAt)`, `notifications (userId, readAt, createdAt)`, `sessions (userId)`, `friendships (userIdA, userIdB)` unique, `rooms (visibility, isActive)`, ordered equality→sort→range.
- **Timestamps & soft-delete:** every model carries `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`; soft-delete via `deletedAt DateTime?` filtered out of queries.

**Schema evolution:** because the Mongo connector has no `prisma migrate`, we use **`prisma db push`** for schema sync, treat the schema file as the reviewed migration artifact, and record every breaking schema change in `history/` (R3). Where Prisma's query API cannot express a needed operation (text search, complex aggregation, change streams), we drop to `$runCommandRaw` / `findRaw` / `aggregateRaw` inside the owning repository — **never** scattered through services.

Illustrative schema fragment (definition only, not implementation):

```prisma
// packages/database/prisma/schema.prisma
generator client { provider = "prisma-client-js" }
datasource db   { provider = "mongodb"; url = env("DATABASE_URL") }

type RoomSettings {           // EMBED: owned, bounded, read-with-parent
  visibility    String        // "public" | "private" | "password"
  syncAuthority String        // "owner_only" | "owner_moderators" | "everyone"
  chatLocked    Boolean       @default(false)
  playlistLocked Boolean      @default(false)
  isTemporary   Boolean       @default(false)
}

model Room {
  id                String   @id @default(auto()) @map("_id") @db.ObjectId
  name              String
  settings          RoomSettings
  ownerId           String   @db.ObjectId
  ownerDisplayName  String   // DENORM source: users.displayName (eventually consistent)
  currentVideoTitle String?  // DENORM source: queue_items.title (discovery)
  viewerCount       Int      @default(0) // DENORM source: count(memberships active)
  isActive          Boolean  @default(true)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  deletedAt         DateTime?
  @@index([visibility, isActive]) // discovery
  @@map("rooms")
}

model Message {              // REFERENCE: unbounded log → never embedded in Room
  id                String   @id @default(auto()) @map("_id") @db.ObjectId
  roomId            String   @db.ObjectId
  authorId          String   @db.ObjectId
  authorDisplayName String   // DENORM source: users.displayName
  authorAvatarUrl   String?  // DENORM source: users.avatarUrl
  body              String
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  deletedAt         DateTime?
  @@index([roomId, createdAt])
  @@map("messages")
}
```

---

## Consequences → Pros

- **One source of truth for the data model.** The schema file mechanically generates the client; no parallel ODM-schema/TS-interface drift (the core Mongoose failure). Satisfies canon §4 and the `packages/types` non-duplication rule.
- **Compile-time type safety end-to-end.** Every NestJS module gets a fully-typed client; query/return shapes are checked by `tsc`, catching errors before runtime and easing multi-agent collaboration.
- **Document-native modeling stays honest.** Composite types express embeds cleanly; references + back-reference ids keep unbounded collections separate; denormalization is a first-class, documented modeling choice — fully aligned with the SPEC's "avoid relational thinking."
- **Declarative, reviewable indexes.** `@@index` lives beside the model, so the mandatory compound indexes are visible in PR review and version-controlled, not buried in imperative `createIndex` calls.
- **Strong DX + recoverability (R2).** Prisma Studio, autocomplete, and a single human-readable schema make the data model self-documenting and re-derivable after context-window loss; `db push` runs identically in Docker across local/VPS/prod (ADR-010).
- **No query-language lock-in into services.** Services speak the Prisma client API; the database choice stays an implementation detail behind `packages/database`, consistent with the canon's package boundaries.

---

## Consequences → Cons

- **No `prisma migrate` on MongoDB.** We get `db push` only — no auto-generated, versioned migration files. We compensate with schema-file review + mandatory `history/` entries (R3) and disciplined backfill scripts for denorm/shape changes.
- **Incomplete Mongo feature coverage.** Advanced aggregation pipelines, `$text`/search indexes, and change streams are not first-class in the Prisma client; these require `$runCommandRaw`/`aggregateRaw`/`findRaw` escape hatches, which are **untyped** and must be wrapped + typed manually in repositories.
- **Connector maturity lag.** Prisma's Mongo connector trails its SQL connectors; we may hit edge-case bugs or features gated behind preview flags, and must track Prisma releases carefully.
- **Transactions need a replica set.** Multi-document transactions require Mongo running as a replica set even in single-node dev — a Docker-compose requirement (ADR-010) the DevOps Engineer must standardize.
- **Codegen coupling.** `prisma generate` must run in the build/CI pipeline and in every Docker image; a stale client is a class of bug we must guard against in the Turborepo task graph (ADR-001).
- **Denormalization burden moves to us.** Prisma won't keep denormalized snapshots consistent — fan-out + reconciliation is application code we own (see Risks).

---

## Risks & Mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|:--:|:--:|---|
| R1 | **Denormalized fields drift** (e.g. a user renames; stale `authorDisplayName`, `ownerDisplayName`, `viewerCount`). | High | Med | Owning aggregate is source of truth; on mutation, re-fan via realtime events (canon §5) **and** a background reconciliation job. Every denorm field documented with its source at definition. Treat as **eventually consistent** by design (canon §4). |
| R2 | **No migration history** (`db push` only) makes schema evolution error-prone and hard to audit. | High | Med | Schema file is the reviewed artifact; every breaking change ⇒ ADR + `history/` entry (R3). Author idempotent backfill scripts in `scripts/`; rehearse `db push` against a Docker replica before prod. |
| R3 | **Aggregation / search gaps** force untyped raw queries. | Med | Med | Confine all `aggregateRaw`/`findRaw`/`$runCommandRaw` to repository classes in `packages/database`; hand-write + unit-test return types; never leak raw queries into services. Plan a dedicated search index (canon §4) for text-eligible fields. |
| R4 | **Missing relational integrity** — Prisma+Mongo does **not** enforce referential constraints or cascade deletes across references. | High | Med | Enforce invariants in the service layer (NestJS); use soft-delete (`deletedAt`) + scheduled cleanup; unique compound indexes (`memberships`, `friendships`) guard duplicates at the DB level. |
| R5 | **Transactions require replica set**; single-node dev breaks multi-doc writes. | Med | High | DevOps standardizes a single-node **replica-set** Mongo in all Docker environments; document the requirement in `docker/`. Keep transaction scope minimal; prefer idempotent, retryable operations. |
| R6 | **Prisma Mongo connector bug / breaking release** blocks a needed feature. | Low | High | Pin Prisma version in the monorepo; gate upgrades behind CI + the test suite (90% coverage target); the `packages/database` boundary means a connector swap (e.g. to native driver for one repo) is localized, not project-wide. |
| R7 | **`ObjectId` leaks across the service boundary**, violating the "strings everywhere in TS" rule. | Med | Low | Prisma already maps `_id`→`String` via `@db.ObjectId`; lint/review for stray driver usage; the SDK and `packages/types` exchange only string ids. |

---

## Future Considerations

- **Migration tooling.** If Prisma ships first-class `migrate` for MongoDB, adopt it and backfill a baseline migration; until then, formalize the `db push` + backfill-script + `history/` workflow as the team standard.
- **Repository escape-hatch layer.** As aggregation/search/change-stream needs grow, build a thin typed repository layer in `packages/database` that wraps raw Mongo operations behind clean, tested interfaces — keeping services Prisma-shaped while unlocking full Mongo power.
- **Search.** Discovery search across users/rooms/messages/videos/tags (SPEC) likely outgrows Mongo `$text`; evaluate a dedicated search index/service (e.g. Atlas Search or an external engine) behind the same repository boundary; record as a follow-up ADR if it changes architecture (R3).
- **Change streams for denorm reconciliation.** Consider Mongo change streams (via raw driver in `packages/database`) to drive denormalized-field reconciliation and presence/activity fan-out more reactively than polling jobs.
- **Sharding & scale.** If a single collection (e.g. `messages`) outgrows a node, plan a shard key aligned to access patterns (`roomId`); Prisma is transparent to sharding, so this is an ops decision, not a code rewrite.
- **Connector swap insurance.** Should the Prisma Mongo connector prove insufficient long-term, the `packages/database` boundary lets us migrate specific repositories to the native driver (Option C) without touching service code — a deliberate hedge baked into the package layout.

---

*Conforms to [Architecture Canon](../context/architecture.md). Any change to this decision requires a superseding ADR + `history/` entry + context update + repomix update (R3/R4).*
