# Prompt Template — Repomix + Project-State Refresh

> Reusable prompt that drives an agent to re-pack the repository snapshot under `repomix/` and synchronize the recoverable `project-state/` files after a meaningful change — satisfying process rules R4 (architecture change ⇒ repomix update) and R2 (recoverability).

**Status:** CANON-DERIVED (Planning — Phase 0: Architecture)
**Owner agent:** Documentation Engineer (template) · Historian / DevOps (executor)
**Last updated: 2026-06-27**

> Subordinate to the [Architecture Canon](../context/architecture.md). On any conflict, the canon wins. Library index: [`./README.md`](./README.md).

---

## How to use

Run this template at the **end** of any unit of work that changed the repo materially: a merged task, a new ADR, a closed bug, or a phase transition. It produces a fresh packed snapshot and brings the project-state files back in sync so R2 recovery stays cheap.

1. Copy the fenced **PROMPT** block into a fresh conversation.
2. Replace every `«PLACEHOLDER»`; grep for `«` to confirm none remain.
3. Send.

---

````md
# PROMPT — Refresh Repomix Snapshot and Project State

ROLE: You are the **«AGENT_ROLE»** (Historian / DevOps) maintaining the Cowatch project's recoverability guarantees. Under **R4**, every architectural change requires a repomix update; under **R2**, the project must stay fully recoverable from on-disk state. This task keeps both true.

TRIGGER FOR THIS REFRESH: «TRIGGER»  (e.g. "merged task P2-ROOMS-003", "accepted ADR-011", "fixed BUG-007", "phase 1 → phase 2 transition").

CONTEXT YOU MUST LOAD FIRST:
1. The Architecture Canon — `context/architecture.md` (so the snapshot/state stays canon-consistent).
2. `project-state/*` — `current-phase.md`, `current-task.md`, `next-task.md`, `blockers.md`, `completed.md` (if present).
3. `history/decision-ledger.md` (and `history/bugs.md`) — the latest entries that this refresh must reflect.
4. The existing `repomix/` directory + any `repomix.config.*` at the repo root to match the established pack settings.

PART 1 — REPOMIX SNAPSHOT
- Regenerate the packed repository snapshot into `repomix/` using the project's repomix configuration. Prefer the project script if one exists (e.g. `scripts/repomix.*` or an npm/pnpm script); otherwise run `npx repomix` with the repo config.
- Naming: write/update the canonical snapshot file the repo already uses (match the existing name in `repomix/`; if none exists yet, create `repomix/cowatch-repomix.xml` and a dated copy `repomix/snapshots/cowatch-«YYYY-MM-DD».xml`).
- Respect ignore rules: exclude `node_modules`, build output, `.env*`, secrets, large binaries, and generated Prisma client. Never pack secrets.
- Record the pack metadata: file count, token estimate, top-level structure, and the git ref/commit the snapshot corresponds to.
- This is a tooling/packaging step — do NOT implement application code.

PART 2 — PROJECT-STATE SYNC (R2)
Update the `project-state/` files so they reflect reality after «TRIGGER». Keep each file's existing header/format and bump `Last updated:` to `2026-06-27`:
- `current-phase.md` — phase number/name, status, gate; tick exit-criteria checkboxes that are now satisfied.
- `current-task.md` — set to whatever is now actively in progress (or `idle` if between tasks).
- `next-task.md` — promote the next queued task; refresh its precondition/spec links.
- `blockers.md` — close any blocker the trigger resolved (move to "Resolved"); open any new one discovered.
- `completed.md` (create if missing) — append the just-finished unit of work with its id, date, and artifact links.
- If «TRIGGER» was an ADR or bug, confirm the corresponding `history/` row exists (R3); if missing, flag it — do not invent a decision, but note the gap.

PART 3 — CONSISTENCY VERIFICATION
- Confirm the project-state, history ledger, and repomix snapshot all agree on the current phase/task and the latest decisions.
- Confirm every cross-link in the touched project-state files is relative and resolves.
- If you find drift (state says task X in progress but history shows it merged), reconcile it and note the correction.

CONSTRAINTS:
- Idempotent: running this twice with no intervening change must produce no semantic change beyond the snapshot timestamp.
- Do not edit the canon or ADRs here; this template only refreshes the snapshot and the state files. Canon/ADR edits go through `adr.prompt.md`.
- Never commit or pack secrets; verify `.env*` and credentials are excluded.

DELIVERABLES (manifest):
- The repomix snapshot file path(s) written + pack metadata (file count, token estimate, git ref).
- The list of `project-state/` files updated, each with a one-line summary of the change.
- A "consistency: OK / reconciled (details)" line.

SELF-CHECK:
- [ ] Snapshot regenerated; secrets and `node_modules`/build output excluded.
- [ ] `project-state/*` reflect «TRIGGER»; `Last updated: 2026-06-27` bumped where edited.
- [ ] R3 history row for the trigger exists (or the gap is flagged, not faked).
- [ ] State ↔ history ↔ snapshot are mutually consistent.
- [ ] All touched cross-links are relative and resolve.
- [ ] No application code or canon/ADR content was modified here.
````

---

## Notes for the template maintainer

- This template owns workflow steps **10 (repomix)** and **11 (project-state)** — the closing steps of the [per-feature workflow](./README.md#7-the-per-feature-workflow-these-templates-compose).
- It is the natural follow-up to [`adr.prompt.md`](./adr.prompt.md) (artifact D), [`implement-task.prompt.md`](./implement-task.prompt.md), and [`bugfix.prompt.md`](./bugfix.prompt.md), and it keeps the snapshot that [`restore-context.prompt.md`](./restore-context.prompt.md) relies on fresh.
- Live state files it maintains: [`../project-state/current-phase.md`](../project-state/current-phase.md), [`../project-state/current-task.md`](../project-state/current-task.md), [`../project-state/next-task.md`](../project-state/next-task.md), [`../project-state/blockers.md`](../project-state/blockers.md). History it cross-checks: [`../history/decision-ledger.md`](../history/decision-ledger.md).
- **Open question:** snapshot retention policy (how many dated copies to keep under `repomix/snapshots/`). *Recommendation:* keep the latest canonical snapshot plus one per phase transition; prune intra-phase snapshots once a phase closes.
