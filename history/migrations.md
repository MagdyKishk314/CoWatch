# Migrations Log

> Append-only log of every data-model and schema migration in Cowatch — Prisma schema changes, MongoDB collection/index changes, backfills, and denormalization reconciliations.

**Status:** Living (append-only)
**Owner agent:** Historian Engineer
**Last updated: 2026-06-27**

---

## Purpose

This log is the **chronological history of the data model's evolution**. The [Prisma schema](../context/architecture.md#4-data-modeling-conventions-mongodb--prisma) at `packages/database/prisma/schema.prisma` is the *current* shape; this file records *how each change happened*, in what order, with what backfill, and how to roll back.

Because Cowatch is **MongoDB via Prisma** (document-oriented, denormalization-first per canon §4), "migration" covers more than relational DDL:
- Prisma schema/model changes and `prisma db push` / migrate runs.
- New or changed **indexes** (including the mandatory compound indexes in canon §4).
- **Backfills** of new fields and **denormalization reconciliations** (e.g. re-fanning `Membership.userDisplayName`).
- Collection renames (`@@map`) and soft-delete (`deletedAt`) rollouts.

Every migration that changes a client-visible contract MUST also be cross-listed in [breaking-changes.md](./breaking-changes.md).

---

## Entry Format / Template

```md
| <id> | YYYY-MM-DD | <migration name> | <type> | <collections/models touched> | <forward summary> | <backfill / data step> | <rollback plan> | <breaking?> | <links> | <agent> |
```

**Field rules**

| Field | Rule |
|---|---|
| `id` | Stable sequential key `MIG-NNN`, applied in execution order. |
| `date` | UTC date the migration was applied. |
| `name` | Short kebab name matching the migration artifact (e.g. `add-room-discovery-indexes`). |
| `type` | `Schema` \| `Index` \| `Backfill` \| `Denorm-reconcile` \| `Rename` \| `Soft-delete`. |
| `targets` | Collections/models affected (canon `snake_case` names). |
| `forward` | What the migration does going forward. |
| `data_step` | Backfill/reconciliation performed, or `none`. |
| `rollback` | How to reverse it safely (or "forward-only — see notes"). |
| `breaking` | `Yes`/`No`; if `Yes`, link the [breaking-changes.md](./breaking-changes.md) row. |
| `links` | Relative links to the spec/ADR and schema diff. |
| `owner` | Agent who ran it. |

---

## Migrations

> **No entries yet.** No schema migrations have been applied as of 2026-06-27 (Phase 0 — Architecture). The Prisma schema is still being *designed* in planning artifacts and no `db push`/migrate has run. The first migration is expected in **Phase 1 — Authentication** (initial `users`, `sessions` collections + indexes). When it runs, copy the template row below into this table.

| id | date | name | type | targets | forward | data_step | rollback | breaking | links | owner |
|---|---|---|---|---|---|---|---|---|---|---|
| _—_ | _—_ | _No entries yet_ | _—_ | _—_ | _—_ | _—_ | _—_ | _—_ | _—_ | _—_ |

---

_Append new rows in execution order below. Migrations are forward-only history — never delete a row; a reversal is itself a new migration row._
