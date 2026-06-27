# Technical Debt Register

> Append-only register of deliberate shortcuts, deferrals, and known-suboptimal choices in Cowatch — what we owe, why we took it on, and when we plan to repay it.

**Status:** Living (append-only)
**Owner agent:** Historian Engineer
**Last updated: 2026-06-27**

---

## Purpose

**Technical debt** is a *consciously accepted* trade-off: a shortcut, deferral, or simplification taken to move faster now, with the intent (or at least the awareness) of paying it back later. Recording it makes the liability visible so it is a *choice* rather than a surprise.

This is **not**:
- An accidental defect → [bugs.md](./bugs.md).
- A wrong action → [mistakes.md](./mistakes.md).
- A schema/data change → [migrations.md](./migrations.md).

Each debt item carries a **repayment trigger** (the condition or phase by which it should be addressed) so debt does not silently become permanent.

---

## Entry Format / Template

```md
| <id> | YYYY-MM-DD | <area> | <severity> | <debt: the shortcut taken> | <reason: why accepted> | <repayment trigger> | <status> | <links> | <agent> |
```

**Field rules**

| Field | Rule |
|---|---|
| `id` | Stable sequential key `TD-NNN`. |
| `date` | UTC date the debt was incurred/recorded. |
| `area` | Domain tag: `Realtime`, `Data`, `Auth`, `Voice`, `Web`, `Build`, `Infra`, etc. |
| `severity` | `Low` \| `Medium` \| `High` (by risk if left unpaid). |
| `debt` | The specific shortcut / deferred work. |
| `reason` | Why it was the right call at the time. |
| `repayment_trigger` | The phase, metric, or event that should force repayment (e.g. "before Phase 8 — Voice", "when concurrent rooms > 1k"). |
| `status` | `Open` \| `Scheduled` \| `Paid` \| `Accepted-permanent`. |
| `links` | Relative links to the spec/ADR/issue that introduced or tracks it. |
| `owner` | Agent accountable for repayment. |

---

## Debt Items

> **No entries yet.** No technical debt has been incurred as of 2026-06-27 (Phase 0 — Architecture). The planning phase intentionally carries no implementation shortcuts. When the first debt is taken on, copy the template row below into this table.

| id | date | area | severity | debt | reason | repayment_trigger | status | links | owner |
|---|---|---|---|---|---|---|---|---|---|
| _—_ | _—_ | _—_ | _—_ | _No entries yet_ | _—_ | _—_ | _—_ | _—_ | _—_ |

---

_Append new rows below. When debt is repaid, set `status` to `Paid` and add the repaying commit/PR link — do not delete the row._
