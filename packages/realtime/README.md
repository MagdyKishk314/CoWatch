# packages/realtime — Realtime Transport Abstraction

> One-line purpose: The custom, transport-agnostic realtime layer (ADR-004) — the `RealtimeTransport` interface, the canonical message envelope, presence, reconnection/resume, and pluggable adapters.

**Status:** Placeholder — Phase 0 (Architecture). **No code yet** (rule R1: plan before code). This README documents the planned shape of `packages/realtime`.
**Owner agent:** Realtime Engineer
**Last updated: 2026-06-27**

**Canon & cross-links**

- Architecture canon: [../../context/architecture.md](../../context/architecture.md) (§5 defines the interface verbatim)
- Repository map: [../../INDEX.md](../../INDEX.md)
- Governing docs/ADR: [REALTIME](../../docs/REALTIME.md) · [EVENTS](../../docs/EVENTS.md) · [SYNC](../../docs/SYNC.md) · [ADR-004](../../adr/ADR-004-realtime.md)

---

## Purpose

`packages/realtime` is the **replaceable transport boundary** for all realtime traffic. Apps depend only on the `RealtimeTransport` interface and the `RealtimeEnvelope` shape — **never** on a concrete transport — so Cowatch can run on native WebSockets on a VPS today and swap to serverless or LiveKit data-channel transports later without touching feature code (per [ADR-004](../../adr/ADR-004-realtime.md)). Both client and the NestJS WS gateways speak the **identical envelope**.

## Owning agent

**Realtime Engineer.**

## Planned tech

| Concern | Choice |
|---|---|
| Interface | `RealtimeTransport` + `RealtimeEnvelope<T>` (canon §5) |
| Default adapter | `NativeWsTransport` — single WS multiplexed by `room` (VPS) |
| Future adapters | `LiveKitDataChannelTransport`, `DurableObjectTransport`, `VercelEdgeTransport` |
| Selection | Config-driven via `REALTIME_TRANSPORT`; apps are unaware of the choice |
| Ids | ULID message/correlation ids (sortable) |
| Payload types | [packages/types](../types/README.md) (typed `data` on every envelope) |

## Planned contents

```
packages/realtime/
  src/
    transport.ts         # RealtimeTransport interface (canon §5)
    envelope.ts          # RealtimeEnvelope<T>, version v:1
    presence.ts          # PresenceState + presence helpers
    adapters/
      native-ws.ts       # NativeWsTransport (default)
      # livekit-data-channel.ts / durable-object.ts / vercel-edge.ts (future)
    reconnect.ts         # exponential backoff + jitter, resume handshake
    index.ts             # barrel
```

- File naming `kebab-case.ts` (canon §3). Realtime payload types use the `Event`/`Payload` suffix and live in [packages/types](../types/README.md).

## Contracts it must honor (canon §5)

- **Envelope:** `{ v:1, id, type, room?, ts, corr?, data }` on **every** frame, both directions.
- **Reconnection:** exponential backoff with jitter (base 500 ms, cap 15 s), auto re-subscribe of all topics, and a **resume** handshake replaying missed events by `lastEnvelopeId` where the server buffer allows; otherwise request a fresh `playback:sync` + room snapshot.
- **Presence:** `setPresence` / `onPresence` over `PresenceState`.
- **Authority:** the server is authoritative for `playback:*` and stamps `serverEpochMs`; this package transmits but never invents authoritative state.

## Which docs/specs govern this package

- **Primary docs:** [REALTIME.md](../../docs/REALTIME.md), [EVENTS.md](../../docs/EVENTS.md), [SYNC.md](../../docs/SYNC.md); ADR [ADR-004](../../adr/ADR-004-realtime.md).
- **Specs:** the realtime spec in [../../specs/](../../specs/) (R5).
- **Phase:** the interface + `NativeWsTransport` land in **Phase 3 (YouTube Sync)**, then power Phases 4–9 (chat, social, notifications, voice signaling).

## Status notes

Empty today. The interface is fixed by canon §5; adapters are added incrementally.
