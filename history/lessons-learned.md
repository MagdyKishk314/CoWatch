# Lessons Learned

> Append-only log of durable engineering and process lessons learned while building Cowatch — what we discovered, why it mattered, and what we now do differently.

**Status:** Living (append-only)
**Owner agent:** Historian Engineer
**Last updated: 2026-06-27**

> Amended 2026-06-27: added L-003 on the parallel-authoring Open-Questions discipline that surfaced the Phase-0 punch-list pre-code.

---

## Purpose

This log captures **transferable knowledge** — insights that should change future behavior, not one-off events. A lesson earns a row when it has a *takeaway a future engineer can act on*. Distinct from sibling logs:

- A concrete error we made → [mistakes.md](./mistakes.md).
- A defect in shipped behavior → [bugs.md](./bugs.md).
- A deliberate shortcut we owe back → [technical-debt.md](./technical-debt.md).
- A ratified decision → [decision-ledger.md](./decision-ledger.md).

A lesson-learned is the **generalized rule** that often emerges *from* one of those.

---

## Entry Format / Template

```md
| <id> | YYYY-MM-DD | <area> | <context: what happened> | <lesson: the generalized takeaway> | <change: what we now do> | <links> | <agent> |
```

**Field rules**

| Field | Rule |
|---|---|
| `id` | Stable sequential key `L-NNN`. |
| `date` | UTC date the lesson was recorded. |
| `area` | Domain tag: `Process`, `Architecture`, `Realtime`, `Data`, `Auth`, `DX`, `Recovery`, etc. |
| `context` | The situation that produced the lesson (1–2 lines). |
| `lesson` | The generalized, reusable takeaway — written so it applies beyond the original incident. |
| `change` | The concrete behavior/policy/guardrail adopted as a result. |
| `links` | Relative links to the originating ADR, spec, mistake, or canon section. |
| `owner` | Agent who recorded it. |

---

## Lessons

| id | date | area | context | lesson | change | links | owner |
|---|---|---|---|---|---|---|---|
| L-001 | 2026-06-27 | Process | Cowatch is a large, multi-app SaaS (4 apps, 8 packages, 13 phases) built by a team of role-scoped AI agents whose context windows are finite and reset between sessions. Starting implementation before the architecture, contracts, and conventions were pinned would let each agent invent locally-consistent but globally-divergent shapes (route styles, event names, id strategies). | **Plan before code (R1).** When work is parallelized across agents with no shared long-term memory, the *contract* must exist as a written artifact before any implementation, because the contract — not anyone's recollection — is the only thing that keeps independent work convergent. Canon, ADRs, specs, and tasks are not bureaucracy; they are the shared memory the team would otherwise lack. | Phase 0 produces **only** planning artifacts (canon, ADRs, specs, tasks, tests, docs) and forbids application code. Every feature follows spec → tasks → tests → docs → ADR (if needed) → implement (R5). Type names, event names, and route shapes are fixed in [`packages/types`](../context/architecture.md#9-directory--path-map--doc-cross-links) and cited verbatim downstream. | [canon](../context/architecture.md) · [decision-ledger D-001..D-010](./decision-ledger.md) | Historian Engineer |
| L-002 | 2026-06-27 | Recovery | The project must remain fully recoverable despite AI context-window exhaustion (R2). A future agent resuming work has no episodic memory of *why* a thing is the way it is — only the files on disk. If rationale lives only in a chat transcript, it is effectively lost the moment the window rolls over. | **Context preservation is a first-class deliverable.** Durable, on-disk, append-only history (decisions, lessons, mistakes, debt, migrations, breaking changes, bugs) plus recoverable phase state is what makes a context-window-limited team able to resume coherently. Write down the *why*, not just the *what*: a decision without its rationale cannot be safely revisited or reversed. | Every architectural change emits an **ADR + history entry + context update + repomix update** (R3/R4). Phase/progress state is persisted under [`../project-state/`](../context/architecture.md#9-directory--path-map--doc-cross-links) (R2). History files are **append-only** and never rewritten, so the audit trail survives any number of context resets. | [canon §Process discipline](../context/architecture.md#10-cross-cutting-non-negotiables) · [mistakes.md](./mistakes.md) · [technical-debt.md](./technical-debt.md) | Historian Engineer |
| L-003 | 2026-06-27 | Process | Phase-0 planning was authored in parallel by role-scoped agents who each appended an **Open Questions** section to the doc they owned rather than silently guessing at gaps outside their lane. A single Chief-Architect reconciliation pass over those sections surfaced ~6 architecture gaps (e.g. the Redis backplane was a load-bearing dependency hidden inside ADR-004; three real collections — `room_bans`, `join_requests`, `activity_events` — were referenced by specs but missing from the canon collection list) plus ~15 phase-scoped questions — and notably produced **zero contradictions between independently-authored docs**, because every author deferred rather than invented. | **Make "what I'm unsure about" a first-class, written planning output.** When work is fanned out across agents with no shared memory, an explicit per-doc Open-Questions section is a cheap, structured channel that converts silent divergence into a reconcilable punch-list. Resolving these gaps *before* code is dramatically cheaper than discovering them mid-build, where each one would otherwise become a cross-cutting refactor across already-written features. The reconciliation pass also reveals when a buried "implementation detail" is actually load-bearing and deserves its own ADR (here: promoting Redis to ADR-011). | Every planning doc carries an **Open Questions** section; gaps are deferred-with-a-recorded-decision, never silently resolved by an out-of-lane author. A Chief-Architect reconciliation pass clears the punch-list before the R1 coding gate, emitting binding resolutions that downstream agents *implement, not re-litigate*. Each resolution is dated, marked Resolved or Deferred-to-Phase-N **with its decision**, so nothing is left genuinely open. | [decision-ledger 2026-06-27 remediation](./decision-ledger.md) · [project-state/open-questions.md](../project-state/open-questions.md) · [canon](../context/architecture.md) | Historian Engineer |

---

## Open Questions

- **Lesson promotion criteria:** we should define a lightweight rule for when a recurring `mistake` or `bug` graduates into a `lesson` (proposed: a pattern observed ≥2 times, or any single incident with platform-wide blast radius). *Recommendation:* adopt the "twice or platform-wide" heuristic and note it here when ratified.

---

_Append new rows below. Never edit or delete historical lessons; supersede with a newer row if guidance changes._
