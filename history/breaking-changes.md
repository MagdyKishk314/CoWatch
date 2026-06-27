# Breaking Changes Log

> Append-only log of every backward-incompatible change in Cowatch — REST API, realtime envelope/events, data contracts, and client-facing behavior — with migration guidance for consumers.

**Status:** Living (append-only)
**Owner agent:** Historian Engineer
**Last updated: 2026-06-27**

---

## Purpose

A **breaking change** is any change that can break an existing consumer (web, desktop, SDK, or third-party integration) if they do not adapt. This log is the **upgrade contract** between Cowatch and everything that depends on it.

Per [canon §10](../context/architecture.md#10-cross-cutting-non-negotiables), the platform is **URI-versioned** (`/api/v1`) and the realtime envelope carries a protocol version `v`. The standing rule:

- **Breaking REST changes** → a new major version (`/api/v2`); the old version is deprecated per policy, **never silently mutated**.
- **Breaking realtime changes** → bump envelope `v` and provide a compatibility window where the gateway speaks both versions.
- Every breaking change here MUST also have an **ADR** (it is an architectural change, R3/R4) and, if data-related, a [migrations.md](./migrations.md) row.

Additive, backward-compatible changes (new optional fields, new endpoints, new event types) are **not** breaking and do not belong here.

---

## Entry Format / Template

```md
| <id> | YYYY-MM-DD | <surface> | <what changed> | <old → new> | <affected consumers> | <migration guidance> | <version bump> | <deprecation window> | <links> | <agent> |
```

**Field rules**

| Field | Rule |
|---|---|
| `id` | Stable sequential key `BC-NNN`. |
| `date` | UTC date the change shipped (or deprecation began). |
| `surface` | `REST` \| `Realtime` \| `Data` \| `Auth` \| `SDK` \| `Storage`. |
| `change` | What became incompatible. |
| `old_new` | Concise `before → after`. |
| `affected` | Which consumers must adapt (`web`, `desktop`, `sdk`, `external`). |
| `guidance` | Exact steps a consumer takes to migrate. |
| `version` | The version bump (`/api/v2`, envelope `v:2`, `sdk@x`). |
| `deprecation` | The window the old behavior remains supported. |
| `links` | Relative links to ADR, migration, and spec. |
| `owner` | Agent who shipped it. |

---

## Breaking Changes

> **No entries yet.** No breaking changes have occurred as of 2026-06-27 (Phase 0 — Architecture). The platform is establishing its **first** public contracts (`/api/v1`, realtime envelope `v:1`); there is nothing yet to break. When the first incompatible change is proposed, copy the template row below into this table — and remember it also requires an ADR + history entry.

| id | date | surface | change | old → new | affected | guidance | version | deprecation | links | owner |
|---|---|---|---|---|---|---|---|---|---|---|
| _—_ | _—_ | _—_ | _No entries yet_ | _—_ | _—_ | _—_ | _—_ | _—_ | _—_ | _—_ |

---

_Append new rows below. Never edit a historical breaking-change row; if a deprecation window is extended or a change is rolled back, add a follow-up row referencing the original `BC-NNN`._
