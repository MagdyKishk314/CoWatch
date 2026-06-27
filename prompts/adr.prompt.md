# Prompt Template — Architecture Decision Record (ADR)

> Reusable prompt that drives an agent to author a complete ADR for any architectural change, and to produce the three companion artifacts the canon requires (history ledger row, context/canon update, repomix refresh) — satisfying process rules R3/R4.

**Status:** CANON-DERIVED (Planning — Phase 0: Architecture)
**Owner agent:** Documentation Engineer (template) · Chief Architect (executor)
**Last updated: 2026-06-27**

> Subordinate to the [Architecture Canon](../context/architecture.md). On any conflict, the canon wins. Library index: [`./README.md`](./README.md).

---

## How to use

1. Copy the fenced **PROMPT** block into a fresh conversation.
2. Replace every `«PLACEHOLDER»`; grep for `«` to confirm none remain.
3. Send. The agent loads the canon, writes the ADR + the three companion updates, and self-checks.

> **R4 reminder:** No architecture change ships without **all four** outputs (ADR + history + context + repomix). This template produces them together so they never drift apart.

---

````md
# PROMPT — Author an Architecture Decision Record

ROLE: You are the **Chief Architect** (or the «AGENT_ROLE» delegated to own this decision) on the Cowatch founding team. You are recording an architectural decision under process rules **R3/R4**: every architectural decision creates an ADR + a history entry + a context/canon update + a repomix update, and architecture is never changed without all four.

CONTEXT YOU MUST LOAD FIRST:
1. The Architecture Canon — `context/architecture.md` (single source of truth). Re-read §2 (Canonical Architecture Decisions) and any section this decision affects: «AFFECTED_CANON_SECTIONS».
2. The existing ADRs in `adr/` to (a) get the next free number, (b) find ADRs this one relates to or supersedes, (c) match the house ADR format.
3. The decision ledger — `history/decision-ledger.md` — for the row format and the next `D-NNN` id.
4. Current project state — `project-state/current-phase.md`.

DECISION TO RECORD:
- Title: «DECISION_TITLE»
- ADR number (next free, zero-padded): «ADR_NUMBER»  → file `adr/ADR-«ADR_NUMBER»-«KEBAB_TITLE».md`
- Category: «CATEGORY»  (Architecture | Process | Tooling | Data | Security)
- Problem / forcing function: «PROBLEM»
- Proposed decision: «DECISION»
- Options being compared: «OPTIONS»
- «OPTIONAL: Supersedes: ADR-«SUPERSEDED_NUMBER» »

HARD RULES:
- This is a PLANNING/DESIGN artifact. Do not implement application code. Architecture-shaping snippets, schemas, interface sketches, and config examples are allowed; full feature implementations are not.
- Names you cite (types, events, routes, collections, modules, packages) MUST match the canon verbatim. If the decision *introduces* a new name, define it precisely and note that the canon must be updated to include it (the context update below).
- An ADR is immutable history once Accepted: future reversals are recorded by a NEW ADR that supersedes this one — never edit an Accepted ADR's decision in place.

TASK — Produce FOUR artifacts:

**(A) The ADR** at `adr/ADR-«ADR_NUMBER»-«KEBAB_TITLE».md`, matching the house format:
1. Header: H1 `ADR-«ADR_NUMBER»: «DECISION_TITLE»`, a one-line purpose blockquote, then a metadata list — `Status:` (Proposed | Accepted), `Owner agent:`, `Date: 2026-06-27`, `Deciders:`, `Related ADRs:` (relative links), `Canon:` (relative link + the affected section anchors), and a `Last updated: 2026-06-27` line.
2. **Context / Problem** — the forcing function, constraints, and why a decision is needed now. Tie it to the relevant SPEC requirement and canon section.
3. **Options Considered** — at least two real options (plus the chosen one), each with Pros / Cons and an honest assessment. Reject options explicitly with reasons.
4. **Decision** — the choice, stated decisively, with the precise scope of what it does and does not mandate.
5. **Consequences** — positive, negative, and neutral; new constraints imposed on downstream agents; migration/rollout impact; what becomes forbidden (e.g. "Express adapter forbidden" style hard rules) if any.
6. **Compliance & enforcement** — how reviewers verify adherence (link to `code-review.prompt.md` checks); any lint/CI guard implied.
7. **Cross-references** — link back to the canon, related ADRs, and any spec(s) that depend on this.

**(B) History ledger row** — the exact Markdown table row to append to `history/decision-ledger.md` under the correct dated section, using its template: `| D-NNN | 2026-06-27 | «DECISION_TITLE» | «CATEGORY» | Accepted | [ADR-«ADR_NUMBER»](../adr/ADR-«ADR_NUMBER»-«KEBAB_TITLE».md) | <one-line rationale> | «AGENT_ROLE» |`. If this supersedes a prior ADR, also provide the edit that flips the old row's status to `Superseded by ADR-«ADR_NUMBER»`.

**(C) Context / canon update** — the precise diff to `context/architecture.md` (and/or `docs/ARCHITECTURE.md`) needed so the canon reflects the new decision: the ADR bullet under §2, any new name in §3/§4, and any rule change. Present as a clear before/after or an "insert this line under §N" instruction. Do not silently rewrite unrelated canon.

**(D) Repomix + project-state note** — a one-paragraph instruction (or hand-off to `repomix-refresh.prompt.md`) to re-pack the repo snapshot and bump `project-state/` so the change is recoverable (R2/R4).

CONSTRAINTS:
- Polished GitHub-flavored Markdown; mermaid where a diagram clarifies the option trade-offs or the resulting topology.
- Decisive and specific. No vague filler. Genuinely-open follow-ups go under an "Open Questions" heading in the ADR with a recommendation.

DELIVERABLES (manifest):
- `adr/ADR-«ADR_NUMBER»-«KEBAB_TITLE».md`
- The ledger row text for `history/decision-ledger.md`
- The canon/context update instructions for `context/architecture.md`
- The repomix/state refresh note

SELF-CHECK BEFORE YOU FINISH:
- [ ] ADR number is the next free one and unique.
- [ ] At least two real options compared; the rejected ones are rejected with reasons.
- [ ] All four R3/R4 artifacts are present and mutually consistent.
- [ ] Every cited name matches canon; any new name is defined and slated for a canon update.
- [ ] Relative cross-links resolve from `adr/`.
- [ ] Header block + `Last updated: 2026-06-27` present.
- [ ] No application implementation was written.
````

---

## Notes for the template maintainer

- This template owns workflow step **5 (ADR if needed)** and contributes to steps **8–10 (history, context, repomix)** of the [per-feature workflow](./README.md#7-the-per-feature-workflow-these-templates-compose).
- The house ADR format mirrors the existing [`../adr/ADR-001-monorepo.md`](../adr/ADR-001-monorepo.md). Keep new ADRs consistent with it.
- Pair downstream with [`repomix-refresh.prompt.md`](./repomix-refresh.prompt.md) to finalize artifact (D).
