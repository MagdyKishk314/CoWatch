# packages/shared — Cross-Cutting Utilities

> One-line purpose: Framework-agnostic cross-cutting utilities — id generation, the error envelope, config loading, and shared constants — used by every app and package.

**Status:** Placeholder — Phase 0 (Architecture). **No code yet** (rule R1: plan before code). This README documents the planned shape of `packages/shared`.
**Owner agent:** Chief Architect
**Last updated: 2026-06-27**

**Canon & cross-links**

- Architecture canon: [../../context/architecture.md](../../context/architecture.md)
- Repository map: [../../INDEX.md](../../INDEX.md)
- Governing docs: [API](../../docs/API.md) (error envelope) · [SECURITY](../../docs/SECURITY.md) · [ARCHITECTURE](../../docs/ARCHITECTURE.md)

---

## Purpose

`packages/shared` is the **lowest-level utility package** — small, dependency-light helpers that nearly everything else builds on, with no domain knowledge and no framework coupling. It owns the canonical implementations of things that must behave identically everywhere: ULID generation and ObjectId helpers, the standard REST/realtime **error envelope** and `code` enum, correlation-id propagation helpers, config/env loading and validation, time/UTC helpers, and shared constants. Keeping these in one place prevents subtle divergence (e.g. two different error-envelope shapes).

## Owning agent

**Chief Architect.**

## Planned tech

| Concern | Choice |
|---|---|
| Language | TypeScript (no React, no Nest, no Prisma deps) |
| Ids | ULID (realtime/correlation) + ObjectId-string helpers (entities) |
| Errors | Canonical error-envelope builder + `SCREAMING_SNAKE` code enum |
| Config | Env loading + schema validation |
| Time | UTC ISO-8601 / epoch-ms helpers |

## Planned contents

```
packages/shared/
  src/
    ids/                 # ulid(), objectId helpers, correlation-id utils
    errors/              # error envelope, AppError, code enum
    config/              # env loading + validation
    time/                # UTC + epoch-ms helpers
    constants/           # shared constants
    index.ts             # barrel
```

- File naming `kebab-case.ts` (canon §3). No domain types here — those live in [packages/types](../types/README.md); `shared` may depend on `types` but not vice-versa.

## Contracts it must honor

- **Error envelope** (canon §10): `{ "error": { "code", "message", "details", "correlationId", "timestamp" } }` with a stable `SCREAMING_SNAKE` `code` enum, reused by both REST and `system:error`.
- **Id conventions** (canon §10): entity ids = ObjectId strings; realtime/message/correlation ids = ULID (sortable). One `correlationId` per logical operation across REST + realtime + logs.
- **Time** (canon §10): UTC ISO-8601 / epoch-ms only.

## Which docs/specs govern this package

- **Primary docs:** [API.md](../../docs/API.md) (envelopes), [SECURITY.md](../../docs/SECURITY.md), [ARCHITECTURE.md](../../docs/ARCHITECTURE.md).
- **Specs:** referenced by every feature spec ([../../specs/](../../specs/)).
- **Phase:** seeded in **Phase 0/1** as foundational scaffolding; depended on everywhere.

## Status notes

Empty today. Among the first packages populated because nearly everything imports it.
