# Prompt Template — Bug Fix

> Reusable prompt that drives an agent to reproduce, diagnose, and fix a bug with a regression test first, while respecting the Architecture Canon, the R1 gate, and the R3 history-logging rule (`history/bugs.md`).

**Status:** CANON-DERIVED (Planning — Phase 0: Architecture)
**Owner agent:** Documentation Engineer (template) · feature-owning role (executor)
**Last updated: 2026-06-27**

> Subordinate to the [Architecture Canon](../context/architecture.md). On any conflict, the canon wins. Library index: [`./README.md`](./README.md).

---

## How to use

1. Copy the fenced **PROMPT** block into a fresh conversation.
2. Replace every `«PLACEHOLDER»`; grep for `«` to confirm none remain.
3. Send.

> **R1 GATE:** This template touches application code. While coding is gated ([`../project-state/blockers.md`](../project-state/blockers.md), `BLK-001`), the agent must stop after writing the reproducing test + diagnosis and NOT apply a fix.

---

````md
# PROMPT — Diagnose and Fix a Bug (Regression-Test-First)

ROLE: You are the **«AGENT_ROLE»** on the Cowatch team. You fix one bug with a disciplined, root-cause-first approach. You do NOT widen scope, refactor unrelated code, or change architecture without an ADR.

R1 PRECONDITION CHECK: Read `project-state/blockers.md`. If coding is gated, write only the **reproducing test + root-cause analysis + proposed fix**, then STOP and report. Otherwise proceed.

CONTEXT YOU MUST LOAD FIRST:
1. The Architecture Canon — `context/architecture.md` and the sections governing the buggy area: «CANON_SECTIONS».
2. The feature spec + tasks for the affected area: `specs/«FEATURE».spec.md`, `tasks/«FEATURE».tasks.md`.
3. The implicated source under «SUSPECTED_LOCATION» and its existing tests.
4. `history/bugs.md` (for the row format + next bug id) and `history/decision-ledger.md`.

BUG REPORT:
- Id (assign next `BUG-NNN`): «BUG_ID»
- Title: «BUG_TITLE»
- Severity: «SEVERITY»  (critical | high | medium | low)
- Observed behavior: «OBSERVED»
- Expected behavior (cite the spec/acceptance criterion or canon rule it violates): «EXPECTED»
- Repro steps / environment: «REPRO»
- «OPTIONAL: correlationId / logs / stack: «EVIDENCE» »

PROCEDURE (IN ORDER):
1. **Reproduce** — write a **failing regression test** (`*.spec.ts`) that demonstrates the bug and would have caught it. Confirm it fails for the right reason. Place it next to the code it covers.
2. **Diagnose root cause** — trace to the underlying defect, not the symptom. State the root cause in one or two sentences and the exact file:line. Distinguish: logic error vs. canon-violation vs. contract mismatch vs. data-model/index issue vs. race/sync drift vs. permission/authority gap.
3. **Classify** — is the correct fix a code change only, or does it require a **contract/architecture change**? If architectural, STOP and flag that an **ADR (R3/R4)** is required before fixing; do not change architecture here.
4. **Fix** — apply the **minimal** change that addresses the root cause, staying canon-compliant (naming, envelopes, error codes, permissions/authority, ObjectId-as-string, indexes, `correlationId` propagation, UTC times). Do not introduce new public names without canon backing.
5. **Verify** — the regression test now passes; run the full suite + coverage; ensure no regressions and **≥ 90%** coverage on the touched area. Add any missing edge-case tests the root cause exposed.
6. **Log it (R3)** — produce the row to append to `history/bugs.md`: `| «BUG_ID» | 2026-06-27 | «BUG_TITLE» | «SEVERITY» | <root cause one-liner> | <fix one-liner> | <regression test path> | «AGENT_ROLE» |`. If the bug revealed a process/lesson, also note a row for `history/lessons-learned.md`.
7. **State update** — note any `tasks/` / `project-state/` changes and whether a repomix refresh is due.

CONSTRAINTS:
- Root-cause fixes only — no symptom masking (no swallowing errors, no arbitrary sleeps to "fix" a race; fix the synchronization/authority logic instead).
- Keep the diff tight and reviewable; if the fix balloons, that is a signal to reconsider scope or open an ADR.
- Preserve the standard error envelope and `system:error` codes; do not change a stable `code` value without a contract note.

DELIVERABLES (manifest):
- Regression test file path.
- Patched source file(s).
- Root-cause statement (file:line).
- `history/bugs.md` row (and `lessons-learned.md` row if applicable).
- "ADR required: yes/no". "Coverage on touched area: NN%".

SELF-CHECK:
- [ ] A failing regression test existed before the fix and now passes.
- [ ] The fix addresses the documented root cause, not the symptom.
- [ ] Diff is minimal and canon-compliant; no unrelated refactors.
- [ ] Coverage on touched area ≥ 90%; full suite green.
- [ ] `history/bugs.md` row written (R3).
- [ ] No architecture changed without flagging an ADR; R1 gate respected.
````

---

## Notes for the template maintainer

- A bug that requires a contract/architecture change is **out of scope** for this template — hand off to [`adr.prompt.md`](./adr.prompt.md) first, then return here.
- Logs the fix to `history/bugs.md`, complementing the [`../history/decision-ledger.md`](../history/decision-ledger.md). Both satisfy R3's history requirement.
- After fixing, run [`code-review.prompt.md`](./code-review.prompt.md) and [`repomix-refresh.prompt.md`](./repomix-refresh.prompt.md).
