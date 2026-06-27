# Prompt Template — Restore Context (R2 Recovery)

> Reusable prompt that drives an agent to rebuild full working context after a context-window loss, reading the recoverable state and history, and emitting/refreshing `project-state/RESTORE_CONTEXT.md` so any agent can resume work immediately — satisfying process rule R2 (full recoverability).

**Status:** CANON-DERIVED (Planning — Phase 0: Architecture)
**Owner agent:** Documentation Engineer (template) · Historian Engineer (executor)
**Last updated: 2026-06-27**

> Subordinate to the [Architecture Canon](../context/architecture.md). On any conflict, the canon wins. Library index: [`./README.md`](./README.md).

---

## How to use

Run this template **first** whenever an agent starts cold, after a crash, or when picking up someone else's in-flight work. It is read-mostly: it reconstructs context and writes a single recovery digest.

1. Copy the fenced **PROMPT** block into the fresh conversation.
2. Replace every `«PLACEHOLDER»` (often just `«AGENT_ROLE»` and `«FOCUS_AREA»`); grep for `«`.
3. Send. The agent reads the state/history tree and produces `project-state/RESTORE_CONTEXT.md`.

---

````md
# PROMPT — Restore Working Context (R2)

ROLE: You are the **«AGENT_ROLE»** resuming work on the Cowatch platform after a context loss. Process rule **R2** requires the project to be fully recoverable from on-disk state alone — so you rebuild context ONLY from the repository, never from memory or assumption.

OBJECTIVE: Reconstruct enough context to safely resume work on «FOCUS_AREA», and write a concise, authoritative recovery digest to `project-state/RESTORE_CONTEXT.md`.

READ THESE, IN THIS ORDER (do not skip; quote what matters):
1. **Canon** — `context/architecture.md`. Skim the whole thing; note the sections governing «FOCUS_AREA». This is the single source of truth.
2. **Project state** (R2 snapshots):
   - `project-state/current-phase.md` — which phase, gate, status.
   - `project-state/current-task.md` — what is actively in progress.
   - `project-state/next-task.md` — what's queued next.
   - `project-state/blockers.md` — active blockers (note any R1 gate like `BLK-001`).
   - `project-state/completed.md` (if present) — what's done.
3. **History** (R3 ledgers):
   - `history/decision-ledger.md` — every architectural decision + ADR link; find the latest entries.
   - `history/bugs.md`, `history/lessons-learned.md`, `history/breaking-changes.md` (if present).
4. **ADRs** — `adr/` — read the ADRs relevant to «FOCUS_AREA»; they constrain how you may implement.
5. **Specs & tasks** — `specs/«FEATURE».spec.md` and `tasks/«FEATURE».tasks.md` (if «FOCUS_AREA» maps to a feature) — find the next incomplete task and its acceptance criteria.
6. **Repomix** — `repomix/` — if a packed snapshot exists, use it to understand current code shape without re-reading every file.
7. **Docs** — `docs/` — the human-facing doc for «FOCUS_AREA».

THEN PRODUCE `project-state/RESTORE_CONTEXT.md` with this exact structure:

1. **Header block** — H1 `Cowatch — Context Restoration Digest`, one-line purpose, `Status: Active (regenerated on demand)`, `Owner agent: Historian Engineer`, `Last updated: 2026-06-27`. A blockquote linking the canon and the project-state files (relative links).
2. **Where the project is** — phase (number + name), current gate (e.g. R1), overall status, and the one most important fact a resuming agent must know first.
3. **Active + next task** — `taskId`, title, owner, status, blockedBy; the next task and its precondition. Mirror `current-task.md` / `next-task.md`.
4. **Blockers** — table of active blockers with severity + what they block (especially any coding gate).
5. **Canon constraints for «FOCUS_AREA»** — the 5–10 canon rules that most constrain this work (naming, envelope, permissions/authority, auth model, data-model rules), each with a section-anchor link. This is the "don't violate these" cheat sheet.
6. **Relevant decisions** — the ADRs + ledger rows that govern «FOCUS_AREA», with links and a one-line "what it means for me".
7. **Resume point** — the exact next action: which template to run next ([`feature-spec`](../prompts/feature-spec.prompt.md) / [`implement-task`](../prompts/implement-task.prompt.md) / [`bugfix`](../prompts/bugfix.prompt.md) / [`adr`](../prompts/adr.prompt.md)), with which `«TASK_ID»`, and the per-feature-workflow step to re-enter.
8. **Open risks / loose ends** — anything in-flight, half-done, or ambiguous discovered while reading.
9. **Provenance** — list every file you read to build this digest, so the digest is auditable and the next regeneration is cheap.

HARD RULES:
- Do NOT implement anything. This is a read + summarize task that writes exactly one file (`project-state/RESTORE_CONTEXT.md`).
- Do NOT invent state. If a file is missing or ambiguous, say so explicitly under "Open risks / loose ends" and recommend how to resolve it.
- Quote facts (phase, taskId, blocker id) verbatim from the source files; never paraphrase an id.
- Honor the R1 gate: if coding is blocked, the "Resume point" must reflect that (e.g. "await approval; meanwhile produce planning artifacts").

DELIVERABLES:
- `project-state/RESTORE_CONTEXT.md` (overwrite if it exists).
- A 3-bullet TL;DR in your reply: phase/gate, active task, exact next action.

SELF-CHECK:
- [ ] Every id (phase, task, blocker, ADR) is quoted verbatim from a source file.
- [ ] The "Resume point" names a concrete template + task + workflow step.
- [ ] The R1 gate state is correctly reflected.
- [ ] All cross-links are relative and resolve from `project-state/`.
- [ ] Provenance lists every file read.
- [ ] Nothing was implemented; exactly one file was written.
````

---

## Notes for the template maintainer

- This template is the entry point for **R2 recoverability**. It is the first thing a cold agent should run, and it feeds directly into picking the next template from the [per-feature workflow](./README.md#7-the-per-feature-workflow-these-templates-compose).
- It reads the live state files — see [`../project-state/current-phase.md`](../project-state/current-phase.md), [`../project-state/current-task.md`](../project-state/current-task.md), [`../project-state/next-task.md`](../project-state/next-task.md), [`../project-state/blockers.md`](../project-state/blockers.md) — and the [`../history/decision-ledger.md`](../history/decision-ledger.md).
- Keep `RESTORE_CONTEXT.md` regenerable and disposable: it is a derived digest, never an authoritative source. The authoritative sources remain canon + project-state + history.
- Pair with [`repomix-refresh.prompt.md`](./repomix-refresh.prompt.md), which keeps the snapshot this template relies on current.
