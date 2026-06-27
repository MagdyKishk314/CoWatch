# packages/sdk — Typed API Client

> One-line purpose: The typed client SDK that wraps every Cowatch REST and realtime contract, consuming `packages/types` so callers get end-to-end type safety.

**Status:** Placeholder — Phase 0 (Architecture). **No code yet** (rule R1: plan before code). This README documents the planned shape of `packages/sdk`.
**Owner agent:** Backend Engineer
**Last updated: 2026-06-27**

**Canon & cross-links**

- Architecture canon: [../../context/architecture.md](../../context/architecture.md)
- Repository map: [../../INDEX.md](../../INDEX.md)
- Governing docs: [API](../../docs/API.md) · [EVENTS](../../docs/EVENTS.md) · [AUTH](../../docs/AUTH.md)

---

## Purpose

`packages/sdk` is the **one typed gateway** between the front-end apps and the backend. Instead of every app hand-rolling `fetch` calls and event subscriptions, the SDK exposes typed methods for the `/api/v1` REST surface and typed wrappers over realtime topics, all built on the shapes in [packages/types](../types/README.md). This guarantees that a route, DTO, or event payload referenced in client code matches the server contract verbatim, and it centralizes concerns like the error envelope, correlation ids, retries, and auth-token attachment.

## Owning agent

**Backend Engineer** (the API owner), consumed by the Frontend, Social, Media, and Voice Engineers.

## Planned tech

| Concern | Choice |
|---|---|
| REST transport | `fetch`-based typed client over base `/api/v1` |
| Realtime | Thin typed wrappers over [packages/realtime](../realtime/README.md) `RealtimeTransport` |
| Auth | Integrates [packages/auth](../auth/README.md) for bearer + silent refresh |
| Types | [packages/types](../types/README.md) — entities, DTOs, event payloads |
| Errors | Parses the canonical error envelope into typed errors |

## Planned contents

```
packages/sdk/
  src/
    http/                # base client, interceptors, error-envelope parsing
    resources/           # rooms, auth, users, playlist, chat, social, notifications, voice, discovery
    realtime/            # typed subscribe/request wrappers per namespace
    config.ts            # base URL, transport selection
    index.ts             # barrel
```

- File naming `kebab-case.ts` (canon §3). The SDK **never** redefines a type — it imports from [packages/types](../types/README.md).

## Contracts it must honor

- REST routes, methods, and the **success/error envelopes** exactly as canon §10 and [API.md](../../docs/API.md) specify (e.g. `{ "error": { "code", "message", "details", "correlationId", "timestamp" } }`).
- Propagates a ULID `correlationId` via `x-correlation-id` (HTTP) and `corr` (realtime envelope).
- Realtime event names `namespace:entity:action` exactly as catalogued in [EVENTS.md](../../docs/EVENTS.md).

## Which docs/specs govern this package

- **Primary docs:** [API.md](../../docs/API.md), [EVENTS.md](../../docs/EVENTS.md), [AUTH.md](../../docs/AUTH.md).
- **Specs:** every feature spec defines the SDK surface it needs ([../../specs/](../../specs/), R5).
- **Phase:** grows feature-by-feature starting in **Phase 1**, mirroring the server's endpoints as they land.

## Status notes

Empty today. The first resources (auth, me) appear with the Phase 1 backend.
