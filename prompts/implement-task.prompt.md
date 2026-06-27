# Prompt Template — Implement a Task (TDD)

> Reusable prompt that drives an agent to implement a single task test-first, honoring the per-feature workflow, the R1 gate, the Architecture Canon, and the 90% coverage target — then complete the downstream history/context/state updates.

**Status:** CANON-DERIVED (Planning — Phase 0: Architecture)
**Owner agent:** Documentation Engineer (template) · feature-owning role (executor)
**Last updated: 2026-06-27**

> Subordinate to the [Architecture Canon](../context/architecture.md). On any conflict, the canon wins. Library index: [`./README.md`](./README.md).

---

## How to use

1. Copy the fenced **PROMPT** block into a fresh conversation.
2. Replace every `«PLACEHOLDER»`; grep for `«` to confirm none remain.
3. Send.

> **R1 GATE (critical):** This template writes application code. While the project is in phase 0 / paused at `BLK-001` ([`../project-state/blockers.md`](../project-state/blockers.md)), the agent MUST stop after the planning/test-design portion and NOT write implementation. Only run it for real once approval clears the gate.

---

````md
# PROMPT — Implement a Task (Test-Driven)

ROLE: You are the **«AGENT_ROLE»** on the Cowatch engineering team, implementing exactly one task TDD-first under the canon's process discipline.

R1 PRECONDITION CHECK (do this before anything else):
- Read `project-state/blockers.md` and `project-state/current-phase.md`.
- If coding is gated (e.g. `BLK-001` open, planning phase), DO NOT implement. Instead, produce/refine only the **failing test plan and test scaffolding** for this task, report that you stopped at the R1 gate, and end. Otherwise proceed.

CONTEXT YOU MUST LOAD FIRST:
1. The Architecture Canon — `context/architecture.md` (single source of truth) and the governing sections: «CANON_SECTIONS».
2. The feature spec — `specs/«FEATURE».spec.md` — and locate THIS task within it.
3. The task list — `tasks/«FEATURE».tasks.md` — the entry for «TASK_ID».
4. The canonical types — `packages/types` — reuse, never duplicate.
5. Any sibling module/package you must integrate with, and existing tests.

TASK TO IMPLEMENT:
- Task id: «TASK_ID»  (feature «FEATURE», phase «PHASE»)
- Title: «TASK_TITLE»
- Acceptance criteria it satisfies (from the spec): «ACCEPTANCE_CRITERIA_REFS»
- Target location: «TARGET_PATH»  (e.g. `apps/server/src/modules/rooms/…` or `packages/realtime/…`)
- «OPTIONAL: Depends on (must be done first): «DEPENDS_ON» »

HARD RULES / CANON COMPLIANCE:
- Stay strictly within this task's scope. Do not implement adjacent tasks.
- Match the canon verbatim for: file naming (`kebab-case` + mandatory NestJS suffixes `.module/.controller/.service/.gateway/.guard/.dto/.schema/.spec.ts`; React `PascalCase.tsx`; hooks `useX.ts`; stores `x.store.ts`), module-per-bounded-context, REST routes (`/api/v1`, plural, kebab, nested, no verbs), realtime event names (`namespace:entity:action`), MongoDB collections (`snake_case` plural via Prisma `@@map`), type names (PascalCase, no `I` prefix, `…Dto`, `…Event`/`…Payload`).
- Use the `RealtimeEnvelope<T>` (`v:1`) for all WS frames; server is authoritative for `playback:*` and stamps `serverEpochMs`. Honor the permission matrix and `SyncAuthority` modes for any gated action.
- Data model: ObjectId strategy (`String @db.ObjectId`, strings in TS), embed-vs-reference rules, mandatory indexes, `createdAt/updatedAt`, soft-delete `deletedAt`, documented denormalization. Prisma schema lives only in `packages/database/prisma/schema.prisma`.
- Security baseline: validate all input via `class-validator` DTOs, RS256 JWT, httpOnly refresh cookie, CSRF on cookie mutations, rate limits on auth/write, least-privilege MinIO. Standard REST error envelope + `system:error` realtime errors with SCREAMING_SNAKE codes. Propagate `correlationId` (ULID) through HTTP `x-correlation-id` and envelope `corr`. Structured pino logs. UTC/epoch-ms times.

PROCEDURE (TDD — do these IN ORDER):
1. **Restate** the task's acceptance criteria as a short checklist.
2. **Write failing tests first** (`*.spec.ts`) covering each acceptance criterion, the happy path, edge cases, error envelopes, permission/authority denials, and (if realtime) idempotency/ack/reconnect. Aim to drive ≥ 90% coverage of the code you will add.
3. **Run the tests** and confirm they fail for the right reason. (If R1-gated, STOP here and report.)
4. **Implement the minimum code** to make the tests pass, in `«TARGET_PATH»`, following the canon naming + structure. Wire DI/modules/guards as needed.
5. **Refactor** for clarity without changing behavior; keep names canon-aligned.
6. **Run the full test suite + coverage**; ensure green and ≥ 90% for the touched area. Fix lint/type errors.
7. **Detect architectural drift:** if you needed to change a contract, add a module/package, or deviate from canon, STOP implementing and flag that an **ADR (R3/R4)** is required — do not change architecture without one (use `adr.prompt.md`).

DOWNSTREAM WORKFLOW (after green, only when not R1-gated):
- Append a change line to the relevant `history/*` file (e.g. `history/decision-ledger.md` for any decision, or a feature changelog).
- Note any `context/architecture.md` / `docs/*` update the change implies.
- Tick this task in `tasks/«FEATURE».tasks.md`; update `project-state/current-task.md` / `next-task.md`.
- Flag that a repomix refresh is due (hand to `repomix-refresh.prompt.md`).

DELIVERABLES (manifest of absolute/relative paths):
- Test file(s) written.
- Source file(s) written.
- Any schema/index change in `packages/database/prisma/schema.prisma`.
- The history/context/state update notes.
- "ADR required: yes/no". "Coverage on touched area: NN%".

SELF-CHECK BEFORE YOU FINISH:
- [ ] Tests were written BEFORE implementation and now pass green.
- [ ] Coverage on the touched area ≥ 90%.
- [ ] Only this task's scope was implemented.
- [ ] Every name (file/route/event/type/collection) matches canon verbatim.
- [ ] Error envelopes, permissions/authority, and `correlationId` propagation are correct.
- [ ] No architecture changed without flagging an ADR.
- [ ] R1 gate respected.
````

---

## Notes for the template maintainer

- This template owns workflow steps **3 (tests)**, **6 (implement)**, **7 (test)**, and contributes to **8–11 (history/context/repomix/state)** of the [per-feature workflow](./README.md#7-the-per-feature-workflow-these-templates-compose).
- Pair with [`code-review.prompt.md`](./code-review.prompt.md) before merge and [`repomix-refresh.prompt.md`](./repomix-refresh.prompt.md) after.
- The R1 gate references the live blocker in [`../project-state/blockers.md`](../project-state/blockers.md).
