# Prompt Template — Feature Specification

> Reusable prompt that drives an agent to author a complete, canon-compliant feature specification (with implementation tasks, a test plan, and acceptance criteria) — satisfying the R5 gate before any code is written.

**Status:** CANON-DERIVED (Planning — Phase 0: Architecture)
**Owner agent:** Documentation Engineer (template) · feature-owning role (executor)
**Last updated: 2026-06-27**

> Subordinate to the [Architecture Canon](../context/architecture.md). On any conflict, the canon wins. Library index: [`./README.md`](./README.md).

---

## How to use

1. Copy everything inside the fenced **PROMPT** block below into a fresh agent conversation.
2. Replace every `«PLACEHOLDER»`. Then grep the text for `«` — none may remain.
3. Send. The agent loads the canon, writes the spec to its canonical path, and self-checks.

---

````md
# PROMPT — Author a Feature Specification

ROLE: You are the **«AGENT_ROLE»** on the Cowatch founding team, working in the PLANNING phase under process rule **R5** (every feature needs a spec, tasks, tests, docs, and acceptance criteria *before* any code).

CONTEXT YOU MUST LOAD FIRST (in this order, do not skip):
1. The Architecture Canon — `context/architecture.md`. It is the single source of truth.
2. The canon sections governing this feature: «CANON_SECTIONS»  (e.g. `#6-permission-model`, `#7-sync-algorithm`).
3. The phase plan — `docs/PHASES.md` — to confirm this feature belongs to phase «PHASE».
4. Any sibling spec already in `specs/` that this feature touches, and the type source of truth `packages/types`.
5. Current project state — `project-state/current-phase.md` and `project-state/blockers.md`.

HARD RULES:
- This is a PLANNING artifact. Do **NOT** implement the application. Output prose, mermaid diagrams, Prisma schema fragments, TypeScript interfaces/DTOs, API/event contracts, tables, and acceptance criteria only. Illustrative snippets are fine; full feature implementations are forbidden.
- Every type name, enum, event name (`namespace:entity:action`), REST route (`/api/v1/...`), and MongoDB collection name (`snake_case` plural) MUST match the canon **verbatim**. Do not invent new names; if a needed name is missing from canon, list it under "Open Questions" and propose it — do not silently coin it.
- Reuse canonical types from `packages/types`; never duplicate a type. New shared types are declared as proposals, not finalized.
- Respect the standard REST error envelope and realtime envelope (`RealtimeEnvelope<T>`, `v:1`) from the canon.

FEATURE UNDER SPEC: «FEATURE»  (phase «PHASE»)
ONE-LINE GOAL: «FEATURE_GOAL»
IN SCOPE: «IN_SCOPE»
OUT OF SCOPE: «OUT_OF_SCOPE»
«OPTIONAL: KNOWN CONSTRAINTS / NON-FUNCTIONAL TARGETS: «NFRS» »

TASK — Produce a single Markdown file at `specs/«FEATURE».spec.md` with this exact structure:

1. **Header block** — H1 title `«FEATURE» — Feature Specification`, one-line purpose, `Status: Draft`, `Owner agent: «AGENT_ROLE»`, `Last updated: 2026-06-27`. Add a "Canon & cross-links" block linking `../context/architecture.md` (+ the section anchors above), the relevant ADR(s), and sibling specs/docs with **relative** links.
2. **Overview & user value** — what it is, who it serves, where it sits in the phase order.
3. **Domain model touchpoints** — which canon entities (User, Room, Membership, …) this reads/writes; any new fields. Show Prisma schema **fragments** only (respect ObjectId strategy, embed-vs-reference rules, mandatory indexes, timestamps, `deletedAt`, denormalization policy with documented source).
4. **API contract** — every REST endpoint as a table (`METHOD /api/v1/...`, auth, role/permission required, request DTO, success shape, error codes from the SCREAMING_SNAKE vocabulary). Show DTO interfaces (`…Dto`). Versioned, plural, kebab, resource-nested per canon §3.
5. **Realtime contract** — every event as a table (`namespace:entity:action`, direction, authority required, payload type `…Event`/`…Payload`, idempotency/ack behavior). Reference the envelope and reconnection/resume semantics.
6. **Permissions & authority** — map actions to `RoomRole` and (if playback/playlist) `SyncAuthority` mode per canon §6/§7. Note guest gating.
7. **Sequence diagrams** — one or more mermaid `sequenceDiagram`s for the primary flows (client ↔ REST ↔ service ↔ WS gateway ↔ broadcast), including the `correlationId` propagation.
8. **State, edge cases & failure modes** — reconnection, late joiners, race conditions, idempotency, soft-delete, eventual-consistency of denormalized fields.
9. **Security & privacy** — apply the canon §10 security baseline relevant to this feature (rate limits, validation, CSRF on cookie mutations, least-privilege storage, etc.).
10. **Observability** — what to log (structured, with `correlationId`), metrics, and health implications.
11. **Implementation tasks (R5)** — an ordered, checkboxed list of small tasks, each with a stable id `«PHASE_PREFIX»-NNN`, owner role, and a TDD note ("write failing test first"). This becomes `tasks/«FEATURE».tasks.md` content; reference it.
12. **Test plan & coverage** — unit/integration/e2e cases per task, fixtures, and how the **90%** coverage target is met. Include realtime/sync determinism tests where relevant.
13. **Acceptance criteria** — a numbered, testable Given/When/Then list. Each must be objectively verifiable and traceable to a task + test.
14. **Open questions** — anything genuinely undecided, each with a recommendation.
15. **Definition of Done** — the R5 checklist (spec ✓ tasks ✓ tests ✓ docs ✓ ADR? ✓ acceptance criteria ✓) plus the downstream workflow steps (history, context, repomix, project-state).

CONSTRAINTS:
- Polished GitHub-flavored Markdown. Use mermaid where it adds clarity. Tables for contracts.
- Be decisive and specific; avoid vague filler. Genuinely-undecided items go under "Open questions" with a recommendation.
- Stay internally consistent with the canon and with any sibling spec you cross-link.

DELIVERABLES:
- `specs/«FEATURE».spec.md` (this file).
- A note on whether an **ADR is required** (architectural change?) — if yes, name the next ADR id and stop short of writing it (use the `adr` template separately).
- A one-line manifest: the path written + "ADR required: yes/no".

SELF-CHECK BEFORE YOU FINISH (all must pass):
- [ ] Every type/event/route/collection name matches canon verbatim (no invented names outside "Open questions").
- [ ] All cross-links are relative and resolve from `specs/`.
- [ ] Acceptance criteria are Given/When/Then and each maps to a task + a test.
- [ ] Coverage plan reaches 90%.
- [ ] No application implementation was written (planning artifact only).
- [ ] `Last updated: 2026-06-27` and header block present.
````

---

## Notes for the template maintainer

- `«PHASE_PREFIX»` should follow the project-state convention (e.g. `P2-ROOMS`). See [`../project-state/next-task.md`](../project-state/next-task.md) for an example id (`P1-AUTH-KICKOFF`).
- This template owns workflow steps **1 (spec)**, **2 (tasks)**, partial **3 (test plan)**, and **4 (docs stub)** of the [per-feature workflow](./README.md#7-the-per-feature-workflow-these-templates-compose).
- Pair with [`adr.prompt.md`](./adr.prompt.md) when the spec surfaces an architectural decision, and hand off to [`implement-task.prompt.md`](./implement-task.prompt.md) per task once the R1 gate clears.
