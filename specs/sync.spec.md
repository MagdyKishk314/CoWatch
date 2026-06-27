# Media Synchronization Feature Specification

> R5 feature spec for Cowatch server-authoritative playback sync (YouTube first): the playback clock, client server-time estimation, drift measurement & correction, per-operation handling, late-joiner catch-up, buffering recovery, sync authority, and the explicit non-synced set. Target steady-state drift < 500 ms.

**Status:** Draft — Planning (Phase 3: YouTube Sync)
**Owner agent:** Chief Architect (spec) → Media Engineer (implementation)
**Last updated: 2026-06-27**

> **Canon compliance.** This spec is downstream of and MUST comply with the [Architecture Canon](../context/architecture.md). On any conflict, the canon wins. It implements [Canon §7 — Sync Algorithm](../context/architecture.md#7-sync-algorithm), [Canon §6 — Permission Model](../context/architecture.md#6-permission-model) (sync authority), and [Canon §5 — Realtime Transport](../context/architecture.md#5-realtime-transport-abstraction-adr-004). The numeric thresholds below (2 s heartbeat; 500 ms / 2 s drift bands; 30 s ownership grace) are copied **verbatim** from canon and are not re-decided here. Type/event names match canon and sibling docs verbatim.

**Primary references**

- Canon: [§7 Sync](../context/architecture.md#7-sync-algorithm) · [§6 Permissions](../context/architecture.md#6-permission-model) · [§5 Realtime](../context/architecture.md#5-realtime-transport-abstraction-adr-004) · [§10 Non-Negotiables](../context/architecture.md#10-cross-cutting-non-negotiables)
- ADR: ADR-007 — Server-authoritative playback sync (defined in [Canon §2](../context/architecture.md#2-canonical-architecture-decisions-one-line--adr-id)) · [ADR-004 — Realtime abstraction](../adr/ADR-004-realtime.md)
- Design docs: [SYNC.md](../docs/SYNC.md) (deep engineering design) · [PERMISSIONS.md §4](../docs/PERMISSIONS.md#4-sync-authority-modes) · [EVENTS.md §5.4 playback](../docs/EVENTS.md#54-playback-sync-playback--server-authoritative) · [API.md §3.5 playback snapshot](../docs/API.md#35-rooms) · [DOMAIN.md (PlaybackState/QueueItem)](../docs/DOMAIN.md)
- Sibling specs: [auth.spec.md](./auth.spec.md) · [rooms.spec.md](./rooms.spec.md) · [chat.spec.md](./chat.spec.md)

---

## 1. Overview & User Value

Media sync keeps **every member of a room watching the same frame at the same wall-clock instant**. The server holds one authoritative clock; clients continuously steer their local YouTube player toward the server's computed target.

User value:

- **"We're watching together" actually means it** — play, pause, seek, rewind, fast-forward, speed changes, and autoplay advances are synchronized across all viewers within **< 500 ms** steady-state drift (canon §7).
- **No rubber-banding** — small drift is glided away by nudging local playback rate; only large gaps trigger a hard seek, keeping playback smooth.
- **Join anytime, land on the live frame** — a late joiner immediately snaps to the current position without a "scrub from zero" flash.
- **Your comfort stays yours** — volume, captions, audio track, quality, and picture-in-picture are per-viewer and never forced on anyone.
- **Fair control** — who can drive playback is a per-room setting (`owner only` / `owner+moderators` / `everyone`).

This spec is the R5 contract; [docs/SYNC.md](../docs/SYNC.md) is the deep engineering design (formulas, control loop, diagrams) it builds on.

---

## 2. Scope

### 2.1 In scope

- The **server-authoritative `PlaybackState`** (`itemId`, `positionMs`, `isPlaying`, `rate`, `serverEpochMs`) and the **anchor-pair** invariant.
- **Client server-time estimation**: NTP-style `system:clock:ping`/`pong` offset + RTT handshake, filtering, confidence.
- **Drift measurement & correction** bands: `<500 ms` no-op · `500 ms–2 s` rate-glide (±5–10%) · `≥2 s` hard seek.
- **Synced operations**: play, pause, seek, rewind, fast-forward, playback speed (`rate`), item advance/autoplay, skip-vote outcome.
- **Intent → truth** model: clients emit `playback:*` intents; server validates authority, re-stamps `serverEpochMs`, increments `seq`, broadcasts `playback:sync`.
- **Late-joiner catch-up** and **reconnect resume** (immediate fresh sync).
- **Buffering/stall** policy (clock keeps moving; stalled client catches up) + optional `pauseOnAnyBuffer` (spec'd, deferred).
- **Sync authority** binding to the permission model (`SyncAuthority`) and server-side enforcement (`FORBIDDEN_SYNC`).
- The explicit **NOT-synced** set (volume, subtitles, audio track, quality, PiP).
- The REST **playback snapshot** read (`GET /rooms/:roomId/playback`).

### 2.2 Out of scope (owned elsewhere)

- **Playlist/queue CRUD, voting, skip-vote mechanics** (the *queue*; this spec consumes the *outcome* of a skip vote as an item-advance) → Playlist (Phase 3) + [EVENTS.md §5.5](../docs/EVENTS.md#55-playlist--queue-playlist--realtime-namespace-room-per-canon-see-note).
- **Room lifecycle, membership, ownership transfer** → [rooms.spec.md](./rooms.spec.md) (this spec reacts to a transferred authority set; it does not own the transfer).
- **Permission decision function** (`PermissionService`) and the full matrix → [docs/PERMISSIONS.md](../docs/PERMISSIONS.md).
- **Realtime transport, envelope, reconnection/resume wire handshake** → [docs/REALTIME.md](../docs/REALTIME.md) / [EVENTS.md §8](../docs/EVENTS.md#8-reconnection--resume-replay) (this spec uses them).
- **Non-YouTube providers** → future (the provider seam is noted but YouTube is the only Phase 3 provider).
- **Voice/video sync** → [docs/LIVEKIT.md](../docs/LIVEKIT.md) (separate plane, separate clock).

---

## 3. Functional Requirements

| # | Requirement |
|---|---|
| **FR-1** | The server holds the single authoritative `PlaybackState { itemId, positionMs, isPlaying, rate, serverEpochMs }` per room (embedded on the room playback aggregate, canon §4). `positionMs` is valid **only** as of `serverEpochMs` (anchor pair); the live position is always *derived*, never stored as a moving value. |
| **FR-2** | The server emits `playback:sync` carrying the **full** `PlaybackState` (never a delta) **every 2 s** and **immediately on any state change**, with a monotonically increasing per-room `seq`. Late joiners receive one immediately regardless of heartbeat phase (canon §7). |
| **FR-3** | Both server and client compute the live position with the identical pure function `effectivePositionMs(state, nowServerMs, itemDurationMs?)` from `packages/shared`; clients pass `nowServerMs = Date.now() + clockOffsetMs`. |
| **FR-4** | A client establishes a **clock offset** via a 5-ping `system:clock:ping`/`pong` burst (200 ms apart) on connect, refreshed every 30 s and after reconnect / tab re-foreground. It selects the **lowest-RTT** sample (NTP heuristic), filters outliers, and maintains an EMA. `confidence` downgrades to `low` when `rttMs > 400 ms`. |
| **FR-5** | Each client runs a drift control loop on every `playback:sync` and on local player ticks: `driftMs = actualMs − targetMs`. `<500 ms` → no action; `500 ms ≤ |drift| < 2 s` → temporary local rate-glide (±5–10%, restored under a 200 ms hysteresis floor, **never broadcast**); `|drift| ≥ 2 s` → hard `seek` to target with a 1.5 s cooldown. |
| **FR-6** | A client whose `confidence='low'` widens its deadband (`500 + min(rttMs, 500)`); the **2 s hard-seek threshold is never relaxed**. |
| **FR-7** | **Synced operations** are server-mutating intents: `playback:play`, `playback:pause`, `playback:seek {positionMs}` (rewind/fast-forward resolve to an absolute seek), `playback:rate {rate}`, item advance/autoplay, and skip-vote outcome. The server re-anchors `positionMs` to the effective position **before** changing `isPlaying`/`rate`, then re-stamps `serverEpochMs`. |
| **FR-8** | Allowed `rate` values are the YouTube IFrame set `{0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2}`; any other → `system:error` code `INVALID_RATE`. An intent referencing a stale `itemId` → `STALE_ITEM`. Seek targets are clamped to `[0, itemDurationMs]`; a seek past the end during play triggers autoplay advance. |
| **FR-9** | **Authority enforcement** (canon §6/§7): only a member whose effective `RoomRole` satisfies the room's `syncAuthority` (`owner_only` / `owner_moderators` / `everyone`) may emit mutating `playback:*`. Others receive `system:error` code `FORBIDDEN_SYNC` with `details { requiredMode, yourRole }`; `PlaybackState` is unchanged and nothing is broadcast. **Guests are never** playback-eligible in any mode. |
| **FR-10** | Concurrent intents from multiple authorized members are processed **serially per room** (single-writer per `roomId`) with last-writer-wins; each accepted intent yields exactly one broadcast with an incremented `seq`; all clients converge on the highest `seq`. The originator reconciles against the echoed authoritative sync (no special sender path). |
| **FR-11** | **Late joiner**: the room snapshot includes the current `PlaybackState`; the client runs the clock handshake **before** applying the first sync, then performs a **hard seek** to the live frame and matches `isPlaying` — no scrub-from-zero flash. |
| **FR-12** | **Reconnect/resume**: `playback:sync` frames are **not** individually buffered for replay; a resumed client always receives one **fresh** `playback:sync` that fully re-establishes the clock (per [EVENTS.md §8.3](../docs/EVENTS.md#83-what-the-server-buffers)). |
| **FR-13** | **Local buffering** (one viewer stalls): the client emits **no** `playback:*` intent; the room clock keeps moving; on resume the client catches up (hard seek, or rate-glide for short stalls). A controller's local stall **never** pauses the room — only an explicit `playback:pause` does. |
| **FR-14** | The **NOT-synced** set — volume, subtitle/caption selection, audio track, video quality/resolution, picture-in-picture — must **never** appear in `PlaybackState`, any `playback:*` payload, or the realtime stream. Changing them produces **zero** realtime traffic; they live in a client-side store (and optionally user-profile preferences via REST). |
| **FR-15** | `GET /rooms/:roomId/playback` returns a read-only `PlaybackState` snapshot for any member (`Member:Guest`); all **mutations are realtime-only** (no REST playback mutation). |
| **FR-16** | On **ownership transfer** ([rooms.spec.md](./rooms.spec.md) / canon §6) the authorized-controller set is re-derived immediately on the next intent validation; the playback clock itself is unaffected (`PlaybackState` is independent of who owns the room). |

---

## 4. Data Model Touchpoints

> `PlaybackState` is **embedded** on the room playback aggregate (canon §4: embed when owned, bounded, read-with-parent). The canonical TS shape lives in `packages/types`; the queue/item entities in [DOMAIN.md](../docs/DOMAIN.md) / [DATABASE.md](../docs/DATABASE.md).

| Entity / embed | Role in sync | Key fields | Ref |
|---|---|---|---|
| `PlaybackState` (embedded on room) | The authoritative clock | `itemId` (`@db.ObjectId` string \| null), `positionMs`, `isPlaying`, `rate`, `serverEpochMs` | [SYNC.md §2.1](../docs/SYNC.md#21-playbackstate-canonical-record) · [DOMAIN.md](../docs/DOMAIN.md) |
| `queue_items` (referenced) | The media being played | `provider` (`youtube`), `providerVideoId`, `title`, `durationMs`, `position`, `addedBy` + denorm `addedByDisplayName` | [DOMAIN §3.9](../docs/DOMAIN.md#39-queueitem) · [DATABASE §4.7](../docs/DATABASE.md#47-playlists--queue_items) |
| `rooms.settings` (embedded) | Sync authority config | `syncAuthority`, `playlistAuthority` (`SyncAuthority` enum) | [PERMISSIONS.md §4](../docs/PERMISSIONS.md#4-sync-authority-modes) |

Canon compliance:

- `itemId` and all ids are **strings** across the boundary (canon §4); the sync `seq` and any correlation id are monotonic/ULID (canon §10).
- `serverEpochMs` is **stamped only by the server** (canon §7) — clients never write it.
- `PlaybackState` is embedded, not a separate collection; the queue (`queue_items`) is referenced (unbounded list — canon §4 hard rule).
- Denormalized `Room.currentVideoTitle`/`Room.viewerCount` (owned by [rooms.spec.md](./rooms.spec.md)) are updated on item advance, but are **advisory** for sync and never authoritative for the clock.

---

## 5. API & Event Surface

### 5.1 Realtime (`playback` namespace — [EVENTS.md §5.4](../docs/EVENTS.md#54-playback-sync-playback--server-authoritative))

Mutating `playback:*` are **intents** (ack-correlated, 5 s ack timeout); the single truth is `playback:sync` (S→C only).

| Event | Direction | Ack | Payload | Notes |
|---|---|---|---|---|
| `playback:play` | C→S | ack | `{ roomId }` (`PlaybackPlayPayload`) | Authority-gated; sets `isPlaying=true`, re-anchors, restamps, broadcasts sync. |
| `playback:pause` | C→S | ack | `{ roomId }` (`PlaybackPausePayload`) | Freezes the clock. |
| `playback:seek` | C→S | ack | `{ roomId, positionMs }` (`PlaybackSeekPayload`) | Absolute seek; clamped to `[0, durationMs]`. Rewind/FF resolve here. |
| `playback:rate` | C→S | ack | `{ roomId, rate }` (`PlaybackRatePayload`) | Re-anchors then sets `rate`; validated against the allowed set. |
| `playback:sync` | **S→C only** | n/a | `PlaybackSyncEvent` | The only truth: full `PlaybackState` + `seq` + advisory `itemDurationMs`/`authority`. Every 2 s + on change + inline in room snapshot. |
| `system:clock:ping` / `system:clock:pong` | C↔S | fire / corr | `ClockPingPayload` / `ClockPongPayload` | Offset/RTT handshake (§3 above). |

> **Authority rejection.** A mutating intent from a non-authorized member → `system:error { code: FORBIDDEN_SYNC, details: { requiredMode, yourRole } }`, `corr`-tied, no state change, no broadcast (canon §6, [PERMISSIONS.md §4.2](../docs/PERMISSIONS.md#42-enforcement-on-the-wire)).

> **Item advance / skip-vote outcome** is server-initiated: the server emits `playback:item:advance` followed by a fresh `playback:sync` (the skip-vote *tally* is a `room:playlist:*` concern owned by Playlist).

### 5.2 REST ([API.md §3.5](../docs/API.md#35-rooms))

| Method & Path | Permission | Purpose |
|---|---|---|
| `GET /rooms/:roomId/playback` | `Member:Guest` | Read-only `PlaybackState` snapshot. **No mutating REST endpoints** — playback mutation is realtime-only (canon §7). |

### 5.3 Error codes (realtime — same SCREAMING_SNAKE vocabulary as REST, canon §10)

| Code | When |
|---|---|
| `FORBIDDEN_SYNC` | Mutating playback intent from a member not satisfying `syncAuthority` (Guest always). |
| `INVALID_RATE` | `rate` outside the allowed YouTube set. |
| `STALE_ITEM` | Intent references an `itemId` that already advanced. |

---

## 6. Permissions

Sync authority is governed by the room's `SyncAuthority` mode and the member's effective `RoomRole` (canon §6/§7; full detail in [PERMISSIONS.md §4](../docs/PERMISSIONS.md#4-sync-authority-modes)). This spec owns **playback** control only; **playlist** control is a separate `playlistAuthority` knob.

| `SyncAuthority` mode | May emit mutating `playback:*` |
|---|---|
| `owner_only` | `Owner` only |
| `owner_moderators` | `Owner`, `Moderator` |
| `everyone` | `Owner`, `Moderator`, `Member` (never `Guest`) |

- **Owner is always playback-eligible**; **Guest is never**, in any mode.
- Enforcement is **server-side and mandatory**; the client UI mirrors authority but never grants it.
- The same `PermissionService.can(PlaybackControl, ctx)` is used by the WS gateway (canon §6, transport parity).
- On ownership transfer the controller set re-derives immediately on the next intent (FR-16).

---

## 7. Implementation Tasks

> Detailed breakdown lands in `tasks/sync.tasks.md` (Phase 3). High-level decomposition:

1. **Module** — scaffold `PlaybackModule` at `apps/server/src/modules/playback/`; register a `playback` gateway through `RealtimeModule`.
2. **Shared types** — `PlaybackState`, `SyncAuthority`, `PlaybackSyncEvent`, `PlaybackPlayPayload`/`PausePayload`/`SeekPayload`/`RatePayload`/`NudgePayload`, `ClockPingPayload`/`ClockPongPayload`, `ClockSyncResult`, `PlaybackReadinessPayload` in `packages/types`.
3. **`effectivePositionMs`** — pure offset/rate-aware function in `packages/shared`, imported by server **and** clients; unit-tested exhaustively.
4. **Per-room single-writer** — an in-process per-`roomId` async queue/actor serializing intents; last-writer-wins; `seq` increment + full-state broadcast on every accepted mutation.
5. **Server clock authority** — re-anchor `positionMs` on play/rate; clamp seeks; stamp `serverEpochMs`; 2-s heartbeat + immediate-on-change emit; suppress-while-paused optimization behind a flag (OQ-S2).
6. **Authority gate** — `PermissionService.can(PlaybackControl)` check before mutation; `FORBIDDEN_SYNC`/`INVALID_RATE`/`STALE_ITEM` errors.
7. **Clock handshake** — `system:clock:ping`/`pong` server reply (`serverRecvMs`/`serverSentMs`); client burst, outlier filter, lowest-RTT selection, EMA, confidence.
8. **Client control loop** — drift bands, rate-glide with hysteresis, hard-seek cooldown, adaptive deadband, post-seek `playing`-event gating, anti-thrash guards (web player adapter for YouTube IFrame).
9. **Late-joiner & resume** — inline `playback:sync` in `RoomSnapshot`; handshake-before-first-sync; always-fresh sync on resume; first correction is a hard seek.
10. **Buffering policy** — local stall emits no intent; clock keeps moving; catch-up on resume; spec (not ship) `pauseOnAnyBuffer` + `playback:client:ready` advisory readiness; optional `playback:item:preload`.
11. **Item advance** — end-of-item / autoplay / skip-vote-outcome → `playback:item:advance` + fresh sync; update denorm `Room.currentVideoTitle` (write-through to rooms).
12. **REST snapshot** — `GET /rooms/:roomId/playback` read.
13. **Not-synced isolation** — ensure volume/captions/audio-track/quality/PiP live only in `playerPreferences.store.ts`; assert zero realtime traffic on change.
14. **Tests & docs** — unit/integration/e2e (§8); update [docs/SYNC.md](../docs/SYNC.md) cross-links, history + context + repomix + project-state per the per-feature workflow.

---

## 8. Test Plan

Coverage target **90%** (canon §10).

### 8.1 Unit
- `effectivePositionMs`: paused returns `positionMs`; playing extrapolates with `rate`; clamps to `itemDurationMs`; offset correctness.
- Offset estimator: 4-timestamp NTP math, outlier rejection (median+IQR), lowest-RTT selection, EMA, confidence downgrade at `rttMs>400 ms`.
- Drift bands: `<500 ms` no-op; rate-glide multiplier proportional within `[500 ms, 2 s)` and restored under 200 ms hysteresis; `≥2 s` hard seek + 1.5 s cooldown; adaptive deadband when confidence low; 2 s threshold never relaxed.
- Re-anchoring: play/rate collapse the moving clock into `positionMs` before applying the new flag/rate.
- Validation: `INVALID_RATE` outside the allowed set; `STALE_ITEM` for an advanced item; seek clamping.

### 8.2 Integration (Nest test module + gateway harness)
- Authorized `play/pause/seek/rate` mutates `PlaybackState`, re-stamps `serverEpochMs`, increments `seq`, broadcasts to all members incl. originator.
- Non-authorized member (and Guest in every mode) → `FORBIDDEN_SYNC`, no state change, no broadcast.
- Per-room serialization: two concurrent authorized intents resolve last-writer-wins; all observers converge on the highest `seq`.
- Heartbeat: `playback:sync` every 2 s during active playback + immediately on change.
- Skip-vote outcome / end-of-item → `playback:item:advance` + fresh sync; `currentVideoTitle` denorm updated.

### 8.3 End-to-end (3+ web clients + gateway)
- Steady-state inter-client drift stays **< 500 ms** during continuous playback on a healthy network.
- Late joiner: receives an immediate snapshot, hard-seeks to the live frame, matches `isPlaying` — no scrub-from-zero flash.
- Single client `BUFFERING`: emits no intent, room clock keeps moving, catches up on resume.
- Reconnect mid-stream (coordinate with [auth.spec.md](./auth.spec.md) silent refresh / [rooms.spec.md](./rooms.spec.md) resume): one fresh `playback:sync` re-establishes the clock.
- Not-synced: toggling volume/captions/audio-track/quality/PiP on one client produces **zero** realtime frames and no effect on peers.

---

## 9. Documentation Requirements

- Keep [docs/SYNC.md](../docs/SYNC.md) authoritative for formulas, the control loop, and diagrams; this spec links rather than duplicating.
- Document the YouTube IFrame player adapter (granularity ~250 ms vs. the 500 ms deadband) and the rate-glide audio-pitch ceiling (±10%) in `docs/`.
- Cross-link the sync-authority binding from [docs/PERMISSIONS.md §4](../docs/PERMISSIONS.md#4-sync-authority-modes) and the realtime contract from [docs/EVENTS.md §5.4](../docs/EVENTS.md#54-playback-sync-playback--server-authoritative).
- Resolve `pauseOnAnyBuffer` ship/defer (OQ-S1) and record the decision in `history/decision-ledger.md`.
- Update `context/architecture.md` cross-links if any clarification lands, plus `repomix/` and `project-state/` per the per-feature workflow.

---

## 10. Acceptance Criteria (testable, numbered)

- [ ] **AC-1** With 3+ clients on a healthy network, steady-state inter-client drift stays **< 500 ms** during continuous playback. *(FR-1, FR-2, FR-5)*
- [ ] **AC-2** A `playback:play/pause/seek/rate` intent from an authorized member mutates `PlaybackState`, re-stamps `serverEpochMs`, increments `seq`, and is broadcast to **all** members including the originator. *(FR-7, FR-10)*
- [ ] **AC-3** The same intent from a member who does not satisfy the room `syncAuthority` is rejected with `system:error { code: FORBIDDEN_SYNC, details:{requiredMode, yourRole} }`; `PlaybackState` is unchanged. Guests are rejected in every mode. *(FR-9)*
- [ ] **AC-4** Clock offset is established via a 5-ping burst before the first sync is applied; the lowest-RTT sample is selected; `confidence` downgrades when `rttMs > 400 ms`. *(FR-4)*
- [ ] **AC-5** Drift in `[500 ms, 2 s)` triggers rate-glide (±5–10%, restored under a 200 ms hysteresis floor, never broadcast); drift `≥ 2 s` triggers a hard seek with a 1.5 s cooldown. *(FR-5, FR-6)*
- [ ] **AC-6** A late joiner receives an immediate full `PlaybackState` snapshot, hard-seeks to the live frame, and matches `isPlaying` — no scrub-from-zero flash. *(FR-11)*
- [ ] **AC-7** A single client's local `BUFFERING` emits **no** intent; the room clock keeps moving; on resume the client catches up via hard seek (or rate-glide for short stalls). *(FR-13)*
- [ ] **AC-8** None of volume, subtitles, audio track, quality, or PiP ever appear in `PlaybackState` or any `playback:*` payload; changing them produces zero realtime traffic. *(FR-14)*
- [ ] **AC-9** Concurrent intents from two authorized members are serialized per room (last-writer-wins); all clients converge on the highest `seq`. *(FR-10)*
- [ ] **AC-10** An invalid `rate` is rejected with `INVALID_RATE`; a stale `itemId` intent is rejected with `STALE_ITEM`; seeks are clamped to `[0, durationMs]`. *(FR-8)*
- [ ] **AC-11** `GET /rooms/:roomId/playback` returns a read-only snapshot; there is no mutating REST playback endpoint. *(FR-15)*
- [ ] **AC-12** On reconnect a client receives one fresh `playback:sync` (no individually-buffered sync replay) that fully re-establishes the clock; `PlaybackModule` reaches ≥ 90% coverage. *(FR-12)*

---

## 11. Open Questions

| # | Question | Recommendation |
|---|---|---|
| **OQ-S1** | Ship `pauseOnAnyBuffer` in Phase 3 or defer? | **Defer** to post-MVP polish; spec the `playback:client:ready` payload now, gate the feature behind a room setting later. |
| **OQ-S2** | Suppress heartbeats while `isPlaying === false`? | Keep 2 s per canon; evaluate suppressing while paused (change-driven syncs only) under load test in Phase 11. |
| **OQ-S3** | Cap soft rate-glide server-side or trust clients? | **Trust clients** for the local ±10% cosmetic glide (unbroadcast); only authoritative `playback:rate` is server-validated. |
| **OQ-S4** | YouTube IFrame `getCurrentTime()` ~250 ms granularity vs. 500 ms deadband. | Acceptable (~2× jitter); raise the soft-band hysteresis floor from 200 ms if real-world oscillation appears. Validate in Phase 3 QA. |
| **OQ-S5** | Clock re-handshake cadence (30 s) for high-churn mobile. | 30 s + on `visibilitychange`; expose as a transport config constant, tune with telemetry. |

---

### Related documents

- [Architecture Canon](../context/architecture.md) — single source of truth (§5, §6, §7, §10)
- [docs/SYNC.md](../docs/SYNC.md) — sync engineering design (formulas, control loop)
- [docs/PERMISSIONS.md §4](../docs/PERMISSIONS.md#4-sync-authority-modes) — sync-authority modes
- [docs/EVENTS.md §5.4](../docs/EVENTS.md#54-playback-sync-playback--server-authoritative) — `playback` realtime contract
- [docs/API.md §3.5](../docs/API.md#35-rooms) — playback snapshot read
- [docs/DOMAIN.md](../docs/DOMAIN.md) · [docs/DATABASE.md](../docs/DATABASE.md) — `PlaybackState`, `QueueItem`
- Sibling specs: [auth.spec.md](./auth.spec.md) · [rooms.spec.md](./rooms.spec.md) · [chat.spec.md](./chat.spec.md)
</content>
