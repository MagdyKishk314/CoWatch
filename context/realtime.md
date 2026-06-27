# Realtime Context — Cowatch

> One-line purpose: Fast-load digest of the **custom realtime abstraction layer** — the envelope, the transport interface, heartbeat/reconnection rules — pointing to the full design doc.

**Status:** Context digest (Planning — Phase 0)
**Owner agent:** Documentation Engineer
**Last updated: 2026-06-27**

> Amended 2026-06-27: Added the Redis realtime backplane (ADR-011) and the `room:member:update` (S→C) event to this digest per Chief Architect resolutions (B2/B5).

> This is a **condensed context file** for fast restore (R2). It summarizes and **points to** the full design. On any conflict the source wins, in this order: [Architecture Canon §5](./architecture.md#5-realtime-transport-abstraction-adr-004) → [REALTIME.md](../docs/REALTIME.md) → this digest. The envelope shape, the `RealtimeTransport` interface, the backoff constants, the heartbeat cadence, and the event-name grammar are **copied from canon verbatim** and are not re-decided here.

---

## TL;DR

A **replaceable realtime transport** ([ADR-004](../adr/)) lives in `packages/realtime`. Apps depend only on the `RealtimeTransport` **interface**, never a concrete transport. Default adapter is `NativeWsTransport` (single WS multiplexed by room) for VPS; future adapters (`LiveKitDataChannelTransport`, `DurableObjectTransport`, `VercelEdgeTransport`) plug in behind the same interface, selected by config (`REALTIME_TRANSPORT`). The NestJS WS gateways (owned by `RealtimeModule`) speak the **identical envelope** and are **authoritative for `playback:*`**.

## Key decisions (decisive, canon-locked)

- **One envelope, both directions** — every frame is a `RealtimeEnvelope<T>` with `v: 1`, `id` (ULID), `type` (namespaced event), optional `room`, `ts`, optional `corr`, and typed `data` from `packages/types`.
- **Three send modes** — `send()` (fire-and-forget), `request()` (ack-correlated via `corr`, with timeout), `subscribe()` (topic handler scoped by `room`).
- **Event-name grammar** — `namespace:entity:action`, lowercase, colon-delimited. Canonical namespaces: `room`, `playback`, `chat`, `presence`, `social`, `notification`, `voice`, `system`.
- **`room:member:update` (S→C only)** — member-state change **without** join/leave (mute, timeout, role change). Payload `{ roomId, userId, memberId, role?, moderationState?{ muted?, mutedUntil?, timeoutUntil? }, reason? }`. **No ack**, ordered per-topic by `meta.seq`, buffered in the resume ring. (Added 2026-06-27, B5; resolves PERMISSIONS OQ-3.)
- **Reconnection is the transport's job** — exponential backoff **with jitter** (base **500 ms**, cap **15 s**), auto re-subscribe of all topics, and a **resume** handshake replaying missed events by `lastEnvelopeId` where the server buffer allows; otherwise the client requests a fresh `playback:sync` + room snapshot.
- **Presence** is first-class on the interface: `setPresence()` / `onPresence()`, states `online | idle | dnd | offline` with optional `{ kind: 'room'; roomId }` activity.
- **Lifecycle is observable** — `getState()` / `onStateChange()` over `connecting | open | reconnecting | closed`.
- **Server stamps authority** — server validates mutating `playback:*`, applies, re-stamps `serverEpochMs`, and broadcasts.
- **Backplane = Redis ([ADR-011](../adr/ADR-011-realtime-backplane.md))** — cross-instance fan-out via **Redis pub/sub** + a **Redis Streams** resume buffer (bounded **60 s / 500 envelopes per room**); Mongo change streams are secondary reconciliation only. Per-room single-writer playback authority via Redis lock **`playback:lock:{roomId}`** + monotonic `seq`. The backplane sits **below** ADR-004's transport abstraction — serverless adapters (Durable Objects, etc.) swap the bus without touching feature code. The resume handshake replays from this Streams ring; on overflow the client falls back to a fresh `playback:sync` + room snapshot.

## Heartbeat & sync coupling

Server emits `playback:sync` every **2 s** (and immediately on any state change) carrying the full `PlaybackState`. The realtime layer only **carries** these frames; the playback control algorithm (drift bands, rate-glide vs hard-seek) is owned by [SYNC.md](../docs/SYNC.md), and authority enforcement (who may emit mutating events) is owned by [PERMISSIONS.md](../docs/PERMISSIONS.md) / [permissions.md](./permissions.md).

## Cross-cutting hooks

ULID ids + `correlationId` propagate through envelope `corr` and HTTP `x-correlation-id`; realtime errors use the `system:error` envelope with the shared SCREAMING_SNAKE `code` vocabulary (e.g. `FORBIDDEN_SYNC`). See [Canon §10](./architecture.md#10-cross-cutting-non-negotiables).

## Boundaries (what realtime does NOT own)

- Playback control algorithm → [SYNC.md](../docs/SYNC.md)
- Permission/authority matrix → [PERMISSIONS.md](../docs/PERMISSIONS.md)
- Connection auth (token on connect) → [AUTH.md](../docs/AUTH.md)
- Voice/video media (LiveKit SFU, separate plane) → [LIVEKIT.md](../docs/LIVEKIT.md)

---

## Source documents (read these for detail)

| Topic | Authoritative doc |
|---|---|
| Full realtime design (envelope, adapters, fan-out, backpressure, resume) | [../docs/REALTIME.md](../docs/REALTIME.md) |
| Canon — transport abstraction (interface + envelope source of truth) | [./architecture.md#5-realtime-transport-abstraction-adr-004](./architecture.md#5-realtime-transport-abstraction-adr-004) |
| Realtime events & sync loop | [../docs/EVENTS.md](../docs/EVENTS.md) · [../docs/SYNC.md](../docs/SYNC.md) |
| ADR — custom realtime abstraction | [../adr/](../adr/) (ADR-004) |

## Sibling context digests

[business.md](./business.md) · [permissions.md](./permissions.md) · [social.md](./social.md) · [deployment.md](./deployment.md) · [ui.md](./ui.md) · [RESTORE_CONTEXT.md](./RESTORE_CONTEXT.md)
