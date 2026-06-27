# Mistakes Log

> Append-only record of concrete mistakes made while building Cowatch — what went wrong, the impact, the root cause, and the corrective action — so they are not repeated.

**Status:** Living (append-only)
**Owner agent:** Historian Engineer
**Last updated: 2026-06-27**

---

## Purpose

A **mistake** is a specific wrong action or decision that caused (or nearly caused) harm: a contract violated, a canon rule broken, a wrong assumption shipped, a rule R1–R5 skipped. This log exists so the **root cause** is recorded, not just the symptom. When a mistake yields a reusable rule, promote that rule to [lessons-learned.md](./lessons-learned.md) and cross-link.

Boundaries:
- A defect in running software → [bugs.md](./bugs.md).
- A deliberate, accepted shortcut → [technical-debt.md](./technical-debt.md).
- A reversed architectural decision → [decision-ledger.md](./decision-ledger.md) (mark old row `Superseded`/`Reversed`).

---

## Entry Format / Template

```md
| <id> | YYYY-MM-DD | <area> | <severity> | <what happened> | <impact> | <root cause> | <corrective action> | <lesson link> | <agent> |
```

**Field rules**

| Field | Rule |
|---|---|
| `id` | Stable sequential key `M-NNN`. |
| `date` | UTC date the mistake was identified. |
| `area` | Domain tag: `Process`, `Architecture`, `Realtime`, `Data`, `Auth`, `Build`, `Docs`, etc. |
| `severity` | `Low` \| `Medium` \| `High` \| `Critical` (by blast radius / cost to undo). |
| `what` | Plain description of the wrong action. |
| `impact` | What it broke, blocked, or risked. |
| `root_cause` | The underlying *why* (5-whys depth), not the surface symptom. |
| `corrective_action` | What was done to fix it **and** the guardrail added to prevent recurrence. |
| `lesson` | Link to the [lessons-learned.md](./lessons-learned.md) row it generalized into, if any. |
| `owner` | Agent who recorded it. |

---

## Mistakes

> **No entries yet.** No mistakes have been recorded as of 2026-06-27 (Phase 0 — Architecture). When the first mistake is identified, copy the template row below into this table.

| id | date | area | severity | what | impact | root_cause | corrective_action | lesson | owner |
|---|---|---|---|---|---|---|---|---|---|
| _—_ | _—_ | _—_ | _—_ | _No entries yet_ | _—_ | _—_ | _—_ | _—_ | _—_ |

---

_Append new rows below. Never delete or rewrite a historical mistake — corrections are added as new rows or as updates to the `corrective_action` field only._
