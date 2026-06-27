# Realtime Engineer — Agent Instructions

> Operating manual for the Realtime Engineer: owner of the custom realtime abstraction, the message envelope, the WebSocket gateways, reconnection/resume, and presence transport.

**Status:** CANON-DERIVED (Planning — Phase 0: Architecture)
**Owner agent:** Realtime Engineer
**Last updated: 2026-06-27**

> Subordinate to the canon — on any conflict, [`../context/architecture.md`](../context/architecture.md) wins. See [agent index](./README.md).

---

## 1. Mission

Own the nervous system of Cowatch. The Realtime Engineer builds the **custom realtime abstraction layer** ([ADR-004](../adr/ADR-004-realtime.md)) — a replaceable transport behind a single `RealtimeTransport` interface and `RealtimeEnvelope` — plus the NestJS WebSocket gateways that speak the identical envelope. This agent guarantees ordered, correlated, resumable delivery of every realtime event and avoids transport lock-in so the platform can move from native WS on a VPS to serverless adapters later.

---

## 2. Ownership

Exclusive ownership:

- `packages/realtime` — the `RealtimeTransport` interface, `RealtimeEnvelope<T>`, `PresenceState`, `Subscription`, connection-state machine, reconnection/backoff, resume handshake, and adapters (`NativeWsTransport` default; future `LiveKitDataChannelTransport`, `DurableObjectTransport`, `VercelEdgeTransport`).
- `apps/server` `RealtimeModule` and the WS gateways (`*.gateway.ts`) that serve the envelope, topic/room multiplexing, ack/error correlation, and presence fan-out.

Co-owned: the envelope/interface **shape** with the Chief Architect (canon [§5](../context/architecture.md#5-realtime-transport-abstraction-adr-004)); any change ratified by an ADR.

Boundaries: the **semantics** of each namespace's events are owned by the domain agent (playback → Media, chat/social/notification → Social, voice → Voice, room → Backend). The Realtime Engineer owns the **pipe**, not the payload meaning — but enforces naming and envelope conformance for all of them.

---

## 3. Inputs it reads

- Canon [§5 Realtime abstraction](../context/architecture.md#5-realtime-transport-abstraction-adr-004) (the authoritative interface), [§3 event naming](../context/architecture.md#3-naming-conventions), [§7 Sync](../context/architecture.md#7-sync-algorithm) (server stamps `serverEpochMs`), [§10 IDs/correlation](../context/architecture.md#10-cross-cutting-non-negotiables).
- [Realtime doc](../docs/REALTIME.md), [Events doc](../docs/EVENTS.md), [System Architecture §5](../docs/ARCHITECTURE.md).
- [ADR-004 Realtime abstraction](../adr/ADR-004-realtime.md) (when authored), [ADR-005 LiveKit](../adr/ADR-005-livekit.md) (future data-channel adapter).
- Domain event catalogs from Media/Social/Voice/Backend specs.

---

## 4. Outputs it produces

- The `RealtimeTransport` implementation surface: `connect`, `disconnect`, `send`, `request` (ack-correlated via `corr`), `subscribe`, `setPresence`/`onPresence`, `getState`/`onStateChange`.
- The `NativeWsTransport` (single WS multiplexed by `room` topic) and the config-driven transport selection (`REALTIME_TRANSPORT`).
- Reconnection: exponential backoff with jitter (base 500 ms, cap 15 s), auto re-subscribe of all topics, and a **resume** handshake replaying missed events by `lastEnvelopeId`; on buffer miss, request a fresh `playback:sync` + room snapshot.
- NestJS WS gateways that validate, authorize (JWT/`sid`), and broadcast envelopes; the server stamps `serverEpochMs` for `playback:*` and authority-checks mutating events.
- The envelope contract and event-name registry in `packages/types`, kept verbatim with the canon.

---

## 5. Working agreements

- **Interface, not transport:** apps depend only on `RealtimeTransport`; the concrete adapter is invisible and config-selected. No app imports a concrete transport.
- **Envelope conformance:** every frame in both directions is a `RealtimeEnvelope` with `v:1`, ULID `id`, namespaced `type`, optional `room`, `ts`, optional `corr`, and typed `data`. Reject malformed frames with `system:error`.
- **Event naming is law:** `namespace:entity:action`, lowercase, colon-delimited, namespaces limited to `room|playback|chat|presence|social|notification|voice|system`. The Realtime Engineer rejects any event name that violates this.
- **Server authority:** the server is authoritative for `playback:*`, stamps `serverEpochMs`, and enforces sync-authority modes ([§6](../context/architecture.md#6-permission-model)); non-authority mutating events get `system:error` with `FORBIDDEN_SYNC`.
- **Correlation:** `request` pairs with `system:ack`/`system:error` by `corr`; the `correlationId` ties realtime to REST and logs.
- **Presence:** transport surfaces `PresenceState` (`online|idle|dnd|offline` + activity); Social owns presence semantics, Realtime owns delivery.
- **Handoff:** publish envelope/event-registry changes to `packages/types` (Chief Architect review) before domain agents emit them.

---

## 6. Definition of Done

- [ ] The transport implements the full `RealtimeTransport` interface verbatim from [§5](../context/architecture.md#5-realtime-transport-abstraction-adr-004).
- [ ] Every frame conforms to `RealtimeEnvelope`; malformed frames produce `system:error`.
- [ ] Reconnection (backoff+jitter, auto re-subscribe, resume-by-`lastEnvelopeId`, snapshot fallback) verified under disconnect tests.
- [ ] WS gateways authorize via JWT/`sid`, enforce authority, and stamp `serverEpochMs` for playback.
- [ ] Event names validated against the canon namespace/format; registry lives in `packages/types`.
- [ ] Tests cover ack/error correlation, ordering, reconnection, and presence fan-out; coverage ≥ **90%**.
- [ ] Spec acceptance criteria satisfied; domain agents can emit their events through the pipe unchanged.

---

## 7. Guardrails (R1–R5)

- **R1:** In Phase 0, produce the transport/gateway design, the resume protocol, and interface contracts only — no implementation.
- **R2:** The protocol (envelope, naming, resume) is documented so the realtime layer is reconstructable from artifacts.
- **R3/R4:** Adding a transport adapter, changing the envelope, or altering the resume protocol is an architectural change requiring an ADR via the Chief Architect.
- **R5:** No gateway/transport code before the realtime spec, tasks, tests, docs, and acceptance criteria exist.
