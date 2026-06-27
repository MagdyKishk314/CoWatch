# Bug History Log

> Append-only history of notable defects in Cowatch — symptom, root cause, fix, and verification — kept as durable institutional memory across context resets.

**Status:** Living (append-only)
**Owner agent:** Historian Engineer
**Last updated: 2026-06-27**

---

## Purpose

This log is the **durable memory of defects** that mattered: bugs whose root cause, fix, or recurrence risk a future engineer (or context-reset agent) should be able to find on disk. It is the historical companion to the live issue tracker — the tracker holds *open* work; this file holds the *settled record* of how defects were diagnosed and resolved.

A bug earns a row when it is non-trivial: any `High`/`Critical` severity defect, anything affecting sync correctness, auth/security, data integrity, or anything that recurs. Trivial, single-commit typos do not need a row.

Boundaries:
- A wrong *decision/action* → [mistakes.md](./mistakes.md).
- An accepted shortcut → [technical-debt.md](./technical-debt.md).
- A defect that changed a public contract while being fixed → also log in [breaking-changes.md](./breaking-changes.md).

---

## Entry Format / Template

```md
| <id> | YYYY-MM-DD | <area> | <severity> | <symptom> | <root cause> | <fix> | <verification> | <status> | <links> | <agent> |
```

**Field rules**

| Field | Rule |
|---|---|
| `id` | Stable sequential key `BUG-NNN`. |
| `date` | UTC date the bug was reported/identified. |
| `area` | Domain tag: `Realtime`, `Playback-Sync`, `Auth`, `Chat`, `Voice`, `Data`, `Web`, `Desktop`, etc. |
| `severity` | `Low` \| `Medium` \| `High` \| `Critical`. |
| `symptom` | Observable wrong behavior. |
| `root_cause` | The underlying defect (not the symptom). |
| `fix` | What change resolved it. |
| `verification` | How the fix was proven (test added, repro confirmed gone). Coverage target is 90%. |
| `status` | `Open` \| `Fixed` \| `Wontfix` \| `Regressed`. |
| `links` | Relative links to the fixing PR/commit, test, and any related ADR/migration. |
| `owner` | Agent who resolved it. |

---

## Bugs

> **No entries yet.** No bugs have been recorded as of 2026-06-27 (Phase 0 — Architecture). There is no running application yet — only planning artifacts — so there is nothing to defect against. When the first notable bug is found (expected once Phase 1 implementation begins), copy the template row below into this table and add a regression test per the 90% coverage target.

| id | date | area | severity | symptom | root_cause | fix | verification | status | links | owner |
|---|---|---|---|---|---|---|---|---|---|---|
| _—_ | _—_ | _—_ | _—_ | _No entries yet_ | _—_ | _—_ | _—_ | _—_ | _—_ | _—_ |

---

_Append new rows below. Never delete a bug row; if a fixed bug returns, add a new row with `status: Regressed` referencing the original `BUG-NNN`._
