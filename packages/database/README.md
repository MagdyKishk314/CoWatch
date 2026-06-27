# packages/database — Prisma Schema & Client

> One-line purpose: The single owner of the Cowatch data model — the Prisma schema over MongoDB — and the re-export point for the generated Prisma client.

**Status:** Placeholder — Phase 0 (Architecture). **No code yet** (rule R1: plan before code). This README documents the planned shape of `packages/database`.
**Owner agent:** Backend Engineer
**Last updated: 2026-06-27**

**Canon & cross-links**

- Architecture canon: [../../context/architecture.md](../../context/architecture.md)
- Repository map: [../../INDEX.md](../../INDEX.md)
- Governing docs/ADR: [DATABASE](../../docs/DATABASE.md) · [DOMAIN](../../docs/DOMAIN.md) · [ADR-003](../../adr/ADR-003-prisma.md)

---

## Purpose

`packages/database` is the **single owner of the data model**. The Prisma schema here is the one place collections, fields, relations, indexes, and `@@map` names are defined; every other package and app consumes the **generated client re-exported** from here rather than instantiating Prisma independently. This keeps the MongoDB document model authoritative and typed end to end (per [ADR-003](../../adr/ADR-003-prisma.md)).

## Owning agent

**Backend Engineer.**

## Planned tech

| Concern | Choice |
|---|---|
| ORM | Prisma (MongoDB provider) per [ADR-003](../../adr/ADR-003-prisma.md) |
| Database | MongoDB (document-oriented) |
| Id strategy | `id String @id @default(auto()) @map("_id") @db.ObjectId`; FKs `String @db.ObjectId` |
| Collection naming | `snake_case` plural via `@@map` (`users`, `queue_items`, `friend_requests`) |
| Client | Generated Prisma client, re-exported through this package |

## Planned contents

```
packages/database/
  prisma/
    schema.prisma        # THE data model (single owner) — collections, relations, indexes
    migrations/          # Prisma migration history (where applicable)
  src/
    client.ts            # configured PrismaClient instance
    index.ts             # re-exports the client + selected helpers
```

- Schema location is fixed by canon: `packages/database/prisma/schema.prisma`.
- Modeling rules (canon §4): embed when owned/bounded/read-with-parent; reference when large/unbounded/shared; **never embed an unbounded growing list** (messages, queue items, members). Denormalize documented read-hot fields; every collection carries `createdAt`/`updatedAt`; soft-delete via `deletedAt`.

## Mandatory indexes (canon §4)

`memberships (roomId, userId)` unique · `messages (roomId, createdAt)` · `notifications (userId, readAt, createdAt)` · `sessions (userId)` · `friendships (userIdA, userIdB)` unique · `rooms (visibility, isActive)` for discovery.

## Relationship to packages/types

The Prisma-generated types describe the persistence shapes; the **cross-app domain/DTO/event types** are owned by [packages/types](../types/README.md). Where they overlap, `packages/types` is the contract the API and clients speak; this package owns storage. Mapping between them lives in the server modules.

## Which docs/specs govern this package

- **Primary docs:** [DATABASE.md](../../docs/DATABASE.md), [DOMAIN.md](../../docs/DOMAIN.md); ADR [ADR-003](../../adr/ADR-003-prisma.md).
- **Specs:** every feature spec that adds/changes collections in [../../specs/](../../specs/) (R5).
- **Phase:** schema seeded in **Phase 1** and extended per feature thereafter; each schema change follows the migration + history + context + repomix process (R3).

## Status notes

Empty today. The first `schema.prisma` (users, sessions) lands in Phase 1.
