# Voice / Video Feature Specification

> One-line purpose: The R5 specification for Cowatch's voice/video/screen-share feature — multiple LiveKit-backed public/password voice channels per room, server-minted scoped access tokens, camera + screen-share track sources, force-mute/kick moderation, signed webhook reconciliation, and graceful degradation — kept strictly on a separate media plane from the synchronized-playback realtime layer.

- **Status:** Draft (Planning, Phase 8 — Voice; Phase 9 — Video) — code-blocked until this spec + tasks + tests + docs exist (R5)
- **Owner agent:** Social / Voice Engineer
- **Last updated: 2026-06-27**

**Canon & cross-links**

- [Architecture Canon](../context/architecture.md) — single source of truth ([§1 Glossary (VoiceChannel)](../context/architecture.md#1-glossary-of-core-domain-terms), [§3 Naming](../context/architecture.md#3-naming-conventions), [§4 Data Modeling](../context/architecture.md#4-data-modeling-conventions-mongodb--prisma), [§5 Realtime](../context/architecture.md#5-realtime-transport-abstraction-adr-004), [§6 Permissions](../context/architecture.md#6-permission-model), [§8 Auth](../context/architecture.md#8-auth--token-model-adr-008), [§10 Non-Negotiables](../context/architecture.md#10-cross-cutting-non-negotiables))
- Design docs: [LiveKit / Voice Architecture](../docs/LIVEKIT.md) (authoritative voice design) · [Events §5.10 voice](../docs/EVENTS.md#510-voice-signalling--control-voice) · [Permissions](../docs/PERMISSIONS.md) · [Domain Model](../docs/DOMAIN.md)
- ADRs: [ADR-005 LiveKit](../adr/ADR-005-livekit.md) · [ADR-004 Realtime abstraction](../adr/ADR-004-realtime.md) · [ADR-006 Electron desktop](../adr/ADR-006-electron.md) (screen-share picker) · [ADR-008 Auth tokens](../adr/ADR-008-auth.md) · [ADR-009 MinIO storage / ADR-010 Docker-first](../context/architecture.md#2-canonical-architecture-decisions-one-line--adr-id) (future recording / Docker parity; ADR files pending)
- Sibling specs: [friends.spec.md](./friends.spec.md) · [notifications.spec.md](./notifications.spec.md) · [discovery.spec.md](./discovery.spec.md)
- Implementation tasks (planned): [tasks/voice.md](../tasks/voice.md)

> **Conflict rule.** On any discrepancy this spec yields to the [canon](../context/architecture.md), [ADR-005](../adr/ADR-005-livekit.md), and the [LiveKit design doc](../docs/LIVEKIT.md). This spec narrows that design into buildable, testable units; it does not re-decide the two-plane boundary, token model, or LiveKit↔Cowatch mapping.

Owning NestJS module: **`VoiceModule`** (`apps/server/src/modules/voice/`) — the **only** holder of `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` and the only minter of LiveKit tokens. Voice **control** events (`voice:*`) ride the Cowatch realtime plane via `RealtimeModule`; the A/V **media** plane is LiveKit's own connection. Canonical types in `packages/types`; collection `voice_channels` (canon §3).

---

## 1. Overview & User Value

Voice/video is what makes Cowatch "Discord-like" rather than a bare sync tool: while a room watches a synchronized YouTube video, members can talk, turn on cameras, and share screens in **multiple** voice channels per room — some public, some password-protected. A **VoiceChannel** (canon §1) is "a LiveKit-backed audio/video/screen-share channel inside a Room," visibility `public | password` (no `private` — privacy is the parent room's visibility + the password gate).

**The non-negotiable boundary** ([LiveKit §1](../docs/LIVEKIT.md#1-scope--first-principles)): the voice **media plane** (LiveKit SFU, DTLS-SRTP) is fully separate from the **media-sync realtime plane** (server-authoritative playback clock). Killing voice must never affect synchronized viewing or chat (degradation ladder rung 5). A YouTube `playback:sync` is **never** carried over a LiveKit data channel in this phase.

**User value:** real-time togetherness — banter, reactions, "watch my screen" — layered on the shared video without compromising the sync. **Value metric:** voice-attach rate (% of active rooms with ≥ 1 voice participant) and voice session stability.

---

## 2. Scope

### 2.1 In scope

- **Multiple voice channels per room** (each ⇒ exactly one LiveKit room), with a default public `General` channel created per room.
- **Public & password-protected channels** (argon2-hashed passwords; gate at token mint only).
- **Server-minted, single-room-scoped, short-TTL LiveKit access tokens** derived from `Membership.role` + channel config + requested capabilities (least privilege).
- **Track sources:** microphone (audio), camera (video), screen share (video + optional screen audio), with role/channel capability gates and simulcast/dynacast.
- **Roster** broadcast over the Cowatch realtime plane (`voice:channel:*`), independent of joining the SFU.
- **Moderation:** force-mute (authoritative at SFU), kick-from-voice, ban interaction, role-change propagation.
- **Signed LiveKit webhooks** as the authoritative participant-lifecycle reconciliation; periodic reconciliation job; eventual-consistency of `activeParticipantCount`.
- **Graceful fallback/degradation** so voice failure never breaks watch + chat; two independent reconnection owners (LiveKit SDK for media, `RealtimeTransport` for control).
- **Desktop screen-share source picker** via Electron `desktopCapturer` IPC (ADR-006).

### 2.2 Out of scope (owned elsewhere / deferred)

- **Synchronized playback** — Sync domain (canon §7); explicitly **not** a LiveKit track.
- **Text chat / typing / reactions** — Chat domain (`chat:*`); voice carries no chat.
- **Room CRUD / membership / join-password for the *room*** — Rooms domain; voice gates on existing `Membership`.
- **Server-side recording (LiveKit Egress)** — deferred beyond Phase 8 ([§10 Open Questions](#10-open-questions); needs consent + MinIO + legal).
- **`LiveKitDataChannelTransport` as an app realtime transport** — a future, separately-ADR'd canon §5 adapter; **not** used for app events in this phase.
- **Multi-region SFU mesh / node autoscaling, E2EE insertable streams** — deferred ([§10](#10-open-questions)).

---

## 3. Functional Requirements

### 3.1 Channels & lifecycle

- **FR-VC-1** A Room MAY contain **multiple** voice channels; each maps to exactly one LiveKit room named `cowatch.<roomId>.<voiceChannelId>` ([LiveKit §2.1](../docs/LIVEKIT.md#21-livekit-room-naming-convention)). The name is advisory; the `voice_channels` collection is the source of truth.
- **FR-VC-2** Every Room is created with one default public channel `General` (`isDefault: true`) that cannot be deleted while it is the fallback.
- **FR-VC-3** Channel CRUD: list, create, update (name/visibility/password/limits), delete (disconnects participants). Create/update/delete require **Owner or Moderator** (canon §6).
- **FR-VC-4** Each channel carries `maxParticipants` (default audio 25; video/screen smaller); capacity enforced at mint **and** re-checked by the `participant_joined` webhook (race-safe ceiling).
- **FR-VC-5** A given **device-session** is in **at most one** voice channel at a time (mirrors Discord); switching = leave current LiveKit room, mint new token, connect new room.

### 3.2 Token issuance (REST, not realtime)

- **FR-TK-1** Token mint is a **REST** action: `POST /api/v1/rooms/:roomId/voice-channels/:channelId/token` (so AuthGuard, rate-limiting, CSRF posture apply — canon §10); it is **never** a realtime event.
- **FR-TK-2** Mint preconditions, in order: caller has a `Membership` in the parent room else `VOICE_NOT_ROOM_MEMBER`; if `visibility='password'`, `dto.password` verified via argon2 else `VOICE_PASSWORD_REQUIRED`/`VOICE_PASSWORD_INVALID`; channel not at capacity else `VOICE_CHANNEL_FULL`.
- **FR-TK-3** The server derives the LiveKit `VideoGrant` deterministically from `(Membership.role, channel config, requested publish caps)`: `roomJoin` + `canSubscribe` for all admitted; `canPublish` per requested sources; **single-room scope**; `roomAdmin`/`roomCreate`/`roomList` **never** granted to client tokens.
- **FR-TK-4** **Guest defaults:** audio + subscribe by default; **camera and screen share off** unless the channel explicitly opts guests in (`guestCanPublishVideo`). Denied capabilities are **down-scoped silently** (reduced `grants`) rather than failing the whole join — except when all requested publish sources are denied and the channel is publish-only, then `VOICE_FORBIDDEN_PUBLISH`.
- **FR-TK-5** Tokens are short-TTL (~10 min for the join window) and the LiveKit `token` is returned **only in the point-to-point REST response** (and the `voice:channel:join` **ack**), **never** broadcast.
- **FR-TK-6** Re-join / channel-switch / long-drop re-mints via the same endpoint (cheap, idempotent, rate-limited); no long-lived LiveKit token-refresh in this phase.

### 3.3 Tracks: audio / video / screen share

- **FR-TR-1** Microphone (audio) is available to all admitted participants, including Guests.
- **FR-TR-2** Camera (video) requires Member+; Guest only if `guestCanPublishVideo`.
- **FR-TR-3** Screen share (video source `screen_share` + optional `screen_share_audio`) requires `channel.allowScreenShare` and Member+; Guest only via opt-in; screen audio defaults **off** per share.
- **FR-TR-4** Camera and screen-share video publish with **simulcast** + **dynacast** enabled so the SFU forwards an appropriate layer per subscriber and drops unwatched layers.
- **FR-TR-5** **Explicit non-overlap:** screen share is an ad-hoc human stream with **no** shared clock and **no** `playback:*` semantics; it never drives or is driven by synchronized playback. A room may run synced YouTube + screen share + voice fully independently.

### 3.4 Roster (control plane)

- **FR-RS-1** Join/leave/mute changes broadcast `voice:channel:*` roster deltas over the **Cowatch realtime plane** (not LiveKit), so non-voice room members see who's present without joining the SFU.
- **FR-RS-2** Full roster snapshot (`voice:channel:roster`) is delivered on join and coarse change; per-participant deltas otherwise.
- **FR-RS-3** Roster truth is reconciled from **LiveKit webhooks** (clients can crash/lie); the broadcast follows webhook confirmation, not the client's claim.
- **FR-RS-4** On realtime resume, the client requests a fresh voice roster snapshot (parallel to the `playback:sync` snapshot), independent of media-plane state.

### 3.5 Moderation (canon §6)

- **FR-MOD-1** **Force-mute** (Owner/Mod): server calls LiveKit `MutePublishedTrack` (authoritative at SFU — a malicious client cannot keep transmitting) and broadcasts `voice:channel:mute`.
- **FR-MOD-2** **Kick from voice** (Owner/Mod): server `RemoveParticipant` + broadcasts `voice:channel:leave`.
- **FR-MOD-3** **Ban from room:** revoke `Membership`, `RemoveParticipant`, and future mint fails `VOICE_NOT_ROOM_MEMBER`.
- **FR-MOD-4** **Role change:** next token mint reflects the new `roomRole`; for immediate effect the server `UpdateParticipant` metadata so other clients re-render badges without a re-join.
- **FR-MOD-5** All privileged actions are authorized against the **live** permission matrix server-side; client-asserted roles are never trusted.

### 3.6 Webhooks & reconciliation

- **FR-WH-1** `POST /api/v1/voice/webhooks/livekit` is **outside** the JWT AuthGuard; it verifies LiveKit's HMAC signature, an IP allowlist, and a raw-body checksum.
- **FR-WH-2** Webhooks are **idempotent** by event `id` (short-TTL dedup store) so retries are safe.
- **FR-WH-3** Handlers: `participant_joined` (confirm roster, increment count, broadcast join, enforce ceiling), `participant_left` (remove, decrement, broadcast leave — handles crashes), `track_published`/`track_unpublished` (update published-media flags), `room_finished` (clear roster, zero count).
- **FR-WH-4** A periodic reconciliation job cross-checks `listParticipants` vs. the DB roster to heal missed webhooks and correct the eventually-consistent `activeParticipantCount` denorm.

### 3.7 Fallback & degradation

- **FR-FB-1** Voice failure **never** disconnects the room: sync + chat continue (degradation ladder rung 5).
- **FR-FB-2** Failure responses: LiveKit unreachable at mint → `503 VOICE_PROVIDER_UNAVAILABLE` + UI "voice unavailable" + backoff; WebRTC connect fail → retry via TURN-over-TLS(443), do not leave the room; mid-call SFU drop → LiveKit SDK auto-reconnect, then re-mint; token expired → transparent re-mint.
- **FR-FB-3** **Independent reconnection ownership:** the LiveKit SDK owns media reconnection (ICE restart/backoff); `RealtimeTransport` owns control-plane reconnection (canon §5 backoff). Neither blocks the other.
- **FR-FB-4** Degradation ladder: full A/V/screen → drop video/screen keep audio → audio-only → listen-only (e.g. mic denied) → voice unavailable (watch+chat preserved). The client signals its rung via the roster.

---

## 4. Data Model Touchpoints

> Prisma owns the persisted shape (ADR-003/ADR-005); the interface below matches [LiveKit §4.1](../docs/LIVEKIT.md#41-voicechannel-data-shape-planning). Collection `voice_channels` (canon §3). Ids are strings (canon §4).

### 4.1 `voice_channels` collection

```ts
interface VoiceChannel {
  id: string;                        // ObjectId (string in TS)
  roomId: string;                    // @db.ObjectId, indexed FK
  name: string;
  visibility: 'public' | 'password';// canon §1 — NO 'private' for voice channels
  passwordHash?: string;            // argon2; iff visibility==='password'; never returned to client
  isDefault: boolean;
  maxParticipants: number;          // capacity ceiling
  guestCanPublishVideo: boolean;    // opt-in override of guest defaults
  allowScreenShare: boolean;        // room-level toggle
  activeParticipantCount: number;   // DENORM — source of truth = LiveKit webhooks; eventually consistent
  createdAt: string;                // ISO-8601 UTC
  updatedAt: string;
  deletedAt?: string | null;        // soft-delete (canon §4)
}
```

### 4.2 Indexes (canon §4)

| Collection | Index | Purpose |
|---|---|---|
| `voice_channels` | `(roomId)` | list a room's channels |
| `voice_channels` | `(roomId, isDefault)` | resolve the default channel |
| `voice_channels` | `(roomId, deletedAt)` | active-channel listing (filter soft-deleted) |

- **Timestamps:** `createdAt @default(now())` + `updatedAt @updatedAt` (canon §4); soft-delete via `deletedAt` (queries filter it).
- **Denormalization:** `activeParticipantCount` is a read-hot denorm whose **source of truth is LiveKit webhooks** (not the DB); it is eventually consistent and corrected by the reconciliation job ([LiveKit §7.3](../docs/LIVEKIT.md#73-reconciliation-job)). It is also a discovery signal but is **never** authoritative for permission.
- **Live roster state** (who is currently connected) is **not** a durable collection field beyond the count — it lives in the realtime gateway's in-memory roster keyed by connection, confirmed by webhooks.
- **Secrets:** `passwordHash` is never returned in any DTO and never logged (canon §10).

### 4.3 LiveKit participant identity (not a DB field)

```
identity = "<userId>:<sessionId>"   // device-session-aware; per LiveKit §2.2
```

Participant `metadata` (server-set at mint, client-immutable) carries `{ userId, kind, roomRole, avatarUrl }` — a role **snapshot** refreshed on mint and via `UpdateParticipant`; privileged actions are always re-checked server-side.

---

## 5. API & Event Surface

### 5.1 REST (canon §3 — resource-nested under the room; action segment for non-CRUD mint)

| Method & path | Purpose | Authority |
|---|---|---|
| `GET /api/v1/rooms/:roomId/voice-channels` | List channels (public joinable; password shown locked) | room member |
| `POST /api/v1/rooms/:roomId/voice-channels` | Create channel | Owner / Moderator |
| `PATCH /api/v1/rooms/:roomId/voice-channels/:channelId` | Update name / visibility / password / limits | Owner / Moderator |
| `DELETE /api/v1/rooms/:roomId/voice-channels/:channelId` | Delete (disconnects participants) | Owner / Moderator |
| `POST /api/v1/rooms/:roomId/voice-channels/:channelId/token` | **Mint LiveKit join token** (`JoinVoiceChannelDto`) | room member (+ password) |
| `POST /api/v1/rooms/:roomId/voice-channels/:channelId/disconnect` | Force-remove a participant | Owner / Moderator |
| `POST /api/v1/voice/webhooks/livekit` | LiveKit signed webhook ingest | signature + IP allowlist (no JWT) |

```ts
// POST .../token request
interface JoinVoiceChannelDto {
  password?: string;                 // required iff channel.visibility === 'password'
  publish: { audio: boolean; video: boolean; screen: boolean };
}

// POST .../token success (bare resource, canon §10) — token is point-to-point only
interface VoiceTokenResponse {
  livekitUrl: string;                // region-selected SFU ws endpoint
  token: string;                     // LiveKit JWT, TTL ~10m, single-room scoped
  channelId: string;
  livekitRoom: string;               // "cowatch.<roomId>.<channelId>"
  identity: string;                  // "<userId>:<sessionId>"
  grants: { canPublishAudio: boolean; canPublishVideo: boolean; canPublishScreen: boolean; canSubscribe: boolean };
  expiresAt: string;                 // ISO-8601 UTC
}
```

All inputs validated via `class-validator` DTOs; non-2xx use the [standard error envelope](../context/architecture.md#10-cross-cutting-non-negotiables) with stable SCREAMING_SNAKE `code` + `correlationId`.

### 5.2 Realtime control events (canon §3 — `voice` namespace; full catalog [Events §5.10](../docs/EVENTS.md#510-voice-signalling--control-voice))

| Event | Direction | Ack | Payload (`data`) | Notes |
|---|---|---|---|---|
| `voice:channel:join` | C→S | ack | `{ roomId, channelId, password? }` | Server mints a **scoped token** returned in the ack (point-to-point), then broadcasts a roster delta. |
| `voice:channel:join` | S→C | n/a | `{ roomId, channelId, userId, displayName }` | Roster delta (**no token**). |
| `voice:channel:leave` | C→S | ack | `{ roomId, channelId }` | Server revokes/expires grant + broadcasts. |
| `voice:channel:leave` | S→C | n/a | `{ roomId, channelId, userId }` | Roster delta. |
| `voice:channel:roster` | S→C | n/a | `{ roomId, channelId, members: VoiceRosterEntry[] }` | Full snapshot on join / coarse change. |
| `voice:channel:mute` | C→S | ack | `{ roomId, channelId, targetUserId, muted }` | **Owner/Mod** force-mute; server instructs LiveKit + broadcasts. |
| `voice:channel:mute` | S→C | n/a | `{ channelId, userId, muted, by }` | Committed force-mute. |

- The LiveKit access token is **never** broadcast over the app socket; it is returned only in the join **ack** (point-to-point) or the REST mint response.
- Every frame is the canon [`RealtimeEnvelope`](../context/architecture.md#5-realtime-transport-abstraction-adr-004) (`v:1`, ULID `id`, `corr`); realtime errors use `system:error` with the same codes.

### 5.3 Error code vocabulary (this feature)

`VOICE_CHANNEL_NOT_FOUND`, `VOICE_PASSWORD_REQUIRED`, `VOICE_PASSWORD_INVALID`, `VOICE_NOT_ROOM_MEMBER`, `VOICE_CHANNEL_FULL`, `VOICE_FORBIDDEN_PUBLISH`, `VOICE_PROVIDER_UNAVAILABLE`.

---

## 6. Permissions / Privacy

| Concern | Rule | Enforced at |
|---|---|---|
| **Channel CRUD / mute / kick** | Owner or Moderator (canon §6) | controller guard + gateway authority check |
| **Token mint eligibility** | room `Membership` required; password channel requires correct password | mint preconditions (FR-TK-2) |
| **Publish capabilities** | derived from role + channel config; Guests no camera/screen by default | grant derivation (FR-TK-3/4) |
| **Token scope** | single LiveKit room; never `roomAdmin`/`roomCreate`; short TTL | grant derivation (FR-TK-3) |
| **Password handling** | argon2-hashed, verified only at mint, rate-limited, never returned/logged | mint + DTO projection |
| **Webhook trust** | HMAC signature + IP allowlist + raw-body checksum; idempotent | webhook route (FR-WH-1/2) |
| **Force-mute authority** | enforced at the SFU (server admin), not a client courtesy | LiveKit `MutePublishedTrack` (FR-MOD-1) |
| **Admin secrets** | API key/secret server-only; admin token never issued to clients | `VoiceModule` |

Media is DTLS-SRTP encrypted to the SFU; signaling over WSS/TLS; TURN over TLS/443 for restrictive networks; strict CORS on REST (canon §10, [LiveKit §11](../docs/LIVEKIT.md#11-security-summary-canon-10-alignment)). `correlationId` (ULID) is attached to every mint + webhook and propagated to logs and the resulting `voice:channel:*` broadcast.

---

## 7. Implementation Tasks

> Seeds [tasks/voice.md](../tasks/voice.md). No app code until tasks + tests exist (R5).

1. **T-VC-Schema** — Add `voice_channels` model (+ §4.2 indexes, soft-delete) to the Prisma schema; generate the client. *(FR-VC-1..4, §4)*
2. **T-VC-Types** — `VoiceChannel`, `JoinVoiceChannelDto`, `VoiceTokenResponse`, `VoiceRosterEntry`, voice event payloads in `packages/types`. *(§4, §5)*
3. **T-VC-ChannelCrud** — `VoiceChannelService` + controller for list/create/update/delete with Owner/Mod guards, default `General` creation on room create, password set/change (argon2). *(FR-VC-2/3, §5.1)*
4. **T-VC-Token** — `VoiceService.joinVoiceChannel(...)`: preconditions (member/password/capacity), `deriveGrant` (role + config + caps, guest defaults, down-scope), AccessToken mint (TTL ~10m), point-to-point return. *(FR-TK-1..6)*
5. **T-VC-Gateway** — Register `voice:channel:*` handlers in the realtime gateway; token only in join ack; roster delta broadcasts. *(FR-RS-1..4, §5.2)*
6. **T-VC-Admin** — `RoomServiceClient` admin wrapper (mutePublishedTrack, removeParticipant, updateParticipant, deleteRoom, updateRoomMetadata) with admin-scoped token held server-only. *(FR-MOD-1..5)*
7. **T-VC-Webhooks** — Signed webhook route (HMAC + IP allowlist + raw-body checksum), idempotent dedup, handlers for join/left/track/finished, roster + count reconciliation. *(FR-WH-1..3)*
8. **T-VC-Reconcile** — Periodic reconciliation job healing roster + `activeParticipantCount` from `listParticipants`. *(FR-WH-4)*
9. **T-VC-Fallback** — Fallback/degradation handling + `VOICE_PROVIDER_UNAVAILABLE`; ensure voice failure never disconnects the room. *(FR-FB-1..4)*
10. **T-VC-Client** — `useVoiceChannel` hook + `voice.store.ts` (Zustand) wrapping `livekit-client`; map LiveKit `RoomEvent`s to roster state; cross-check against `voice:channel:*`. *(client; [LiveKit §10](../docs/LIVEKIT.md#10-client-sdk-usage-plan))*
11. **T-VC-Desktop** — Electron `desktopCapturer` IPC source picker for screen share; reuse the web wrapper (ADR-006). *(FR-TR-3)*
12. **T-VC-Tests** — Unit + integration + e2e per [§ Test Plan](#-test-plan) to ≥ 90%.
13. **T-VC-Docs** — Reconcile [docs/LIVEKIT.md](../docs/LIVEKIT.md) + [docs/EVENTS.md §5.10](../docs/EVENTS.md#510-voice-signalling--control-voice) with this spec; author user-facing [docs/VOICE.md](../docs/VOICE.md); then history + context + repomix + project-state.

---

## Test Plan

Coverage target **90%** (canon §10). Layers: unit (grant derivation, preconditions, fallback), integration (Prisma + token mint with a LiveKit test/mock + signed webhooks), e2e (REST + WS roster), and security.

### Unit

- **Grant derivation:** role × channel config × requested caps → correct `VideoGrant`; single-room scope; never `roomAdmin`/`roomCreate`; guest camera/screen off unless opted in; silent down-scope vs. `VOICE_FORBIDDEN_PUBLISH`.
- **Preconditions:** non-member → `VOICE_NOT_ROOM_MEMBER`; missing/wrong password → `VOICE_PASSWORD_REQUIRED`/`VOICE_PASSWORD_INVALID`; full → `VOICE_CHANNEL_FULL`.
- **Visibility rule:** voice channel cannot be created with `private`; only `public`/`password`.
- **Fallback ladder:** each rung maps to the documented response; mint failure yields `VOICE_PROVIDER_UNAVAILABLE`.

### Integration (DB + LiveKit mock)

- **Token mint:** issued token is single-room scoped, TTL ≤ 10m, carries correct source-level publish grants; password verified via argon2; password never returned/logged.
- **Webhook signature:** invalid HMAC/IP rejected (401, ignored); valid processed; duplicate event `id` is a no-op (idempotent).
- **Roster reconciliation:** `participant_joined`/`participant_left` update count + roster + broadcast; a crashed participant (no graceful leave) is removed via `participant_left`; reconciliation job heals a dropped webhook.
- **Capacity race:** a `participant_joined` exceeding the cap triggers server `removeParticipant`; overflow joiner gets `VOICE_CHANNEL_FULL`.

### e2e (REST + realtime)

- Member mints a token and joins a public channel; non-member gets `VOICE_NOT_ROOM_MEMBER`; roster `voice:channel:join` broadcasts to room members without the token.
- Password channel: wrong then correct password; locked listing for non-members.
- Force-mute stops the track at the SFU (client cannot keep transmitting); kick/ban removes the participant and blocks re-mint.
- Channel switch: a device-session leaves one channel and joins another cleanly (at most one at a time).

### Plane-separation / security

- **No plane bleed:** assert no `playback:*` event is ever sent over a LiveKit data channel; killing the LiveKit plane leaves sync + chat fully functional (degradation rung 5).
- Token never appears in any broadcast frame (only in the point-to-point ack / REST response).
- Independent reconnection: media can stay connected while the control plane briefly reconnects, and vice-versa.

---

## Acceptance Criteria

Testable and numbered; the feature is **done** when all pass at ≥ 90% coverage. (Aligned with [LiveKit §12](../docs/LIVEKIT.md#12-acceptance-criteria).)

1. **AC-VC-1 (Join public / member-gated)** A room member can mint a token and join a **public** channel; a non-member receives `VOICE_NOT_ROOM_MEMBER`. *(FR-TK-1/2)*
2. **AC-VC-2 (Password channel)** A `password` channel rejects mint without/with-wrong password (`VOICE_PASSWORD_REQUIRED`/`VOICE_PASSWORD_INVALID`) and accepts a correct one; the password is never returned or logged. *(FR-TK-2)*
3. **AC-VC-3 (Token scope)** Issued LiveKit tokens are **single-room scoped**, ≤ 10-minute TTL, carry correct source-level publish grants, and never include `roomAdmin`/`roomCreate`; the token is delivered only point-to-point. *(FR-TK-3/5)*
4. **AC-VC-4 (Multiple channels / one at a time)** A room supports multiple voice channels; a device-session is in **at most one** at a time; switching cleanly leaves and rejoins. *(FR-VC-1/5)*
5. **AC-VC-5 (Guest capabilities)** Guests get audio + subscribe by default; camera/screen require explicit channel opt-in; denied capabilities are down-scoped, not silently granted. *(FR-TK-4, FR-TR-1/2/3)*
6. **AC-VC-6 (Track sources)** Camera video and screen share publish as **distinct** track sources with simulcast + dynacast enabled; screen audio defaults off. *(FR-TR-3/4)*
7. **AC-VC-7 (Plane independence)** Synchronized YouTube playback and chat are **provably independent** of voice: killing the LiveKit plane leaves sync + chat fully functional (degradation rung 5). *(FR-TR-5, FR-FB-1)*
8. **AC-VC-8 (Webhooks)** Webhooks are signature-verified, IP-allowlisted, idempotent, and reconcile roster + `activeParticipantCount`; a crashed participant is removed via `participant_left` without a client message. *(FR-WH-1..4)*
9. **AC-VC-9 (Moderation authority)** Force-mute stops the track at the SFU (client cannot keep transmitting); kick/ban removes the participant and blocks re-mint; role changes propagate without forcing a re-join. *(FR-MOD-1..5)*
10. **AC-VC-10 (Outage handling)** On LiveKit outage, mint returns `503 VOICE_PROVIDER_UNAVAILABLE`, the UI shows voice unavailable, and the watch party is unaffected. *(FR-FB-1/2)*
11. **AC-VC-11 (No plane bleed)** No `playback:*` event is ever transmitted over a LiveKit data channel; no LiveKit token is ever broadcast over the app socket. *(FR-TR-5, FR-TK-5)*
12. **AC-VC-12 (Observability)** Every token-mint and webhook carries a ULID `correlationId` traceable across REST → realtime broadcast → logs; all errors use the canon envelope/codes; coverage ≥ 90%. *(canon §10)*

---

## 10. Open Questions

| # | Question | Recommendation | Process |
|---|---|---|---|
| **OQ-V1** | Server-side recording (LiveKit Egress)? | **Defer beyond Phase 8** — needs consent flow + MinIO storage (ADR-009) + legal review. Mirrors [LiveKit OQ-3](../docs/LIVEKIT.md#13-open-questions). | New spec + ADR if pursued. |
| **OQ-V2** | Long-lived token refresh vs. cheap re-mint? | **Cheap re-mint now** (FR-TK-6); add LiveKit auto-refresh only if reconnect-storm metrics demand it. | Revisit with metrics. |
| **OQ-V3** | Same user in one channel from web + desktop simultaneously? | **Allow** (distinct `sessionId` identities); UI dedupes display by `userId`. Confirm with product. | Confirm; covered by identity model. |
| **OQ-V4** | Per-channel capacity numbers (audio vs video)? | **Start audio 25 / video 15**; tune against SFU egress metrics post-launch. | Set constants in tasks. |
| **OQ-V5** | Screen-share audio default? | **Off** per share (avoid accidental system-audio leaks); opt-in. | Lock in tasks. |
| **OQ-V6** | LiveKit Cloud vs. self-hosted SFU for launch? | **Self-hosted in Docker** (ADR-010 parity); keep `livekitUrl` config-driven so a managed region can swap in without client changes. | Covered by ADR-005/ADR-010. |
| **OQ-V7** | E2EE (insertable streams) for password channels? | **Defer** — DTLS-SRTP-to-SFU is the baseline; E2EE adds key-management cost and breaks future recording; revisit behind a new ADR. | ADR if a true-private use case demands it. |
| **OQ-V8** | `LiveKitDataChannelTransport` ever carrying app realtime events? | **Defer** — keep planes separate this phase; gate behind a new ADR (canon §5 future adapter). | ADR (R3) if pursued. |

> None of these changes a canonical aggregate boundary; recording (`OQ-V1`), data-channel transport (`OQ-V8`), and any new collection require the R3/R4 process before implementation.

---

## 8. Documentation Requirements

- **Spec → docs:** on implementation, keep [docs/LIVEKIT.md](../docs/LIVEKIT.md) and the [docs/EVENTS.md §5.10](../docs/EVENTS.md#510-voice-signalling--control-voice) catalog in sync with this spec (event names, payloads, error codes, token model); author a user-facing [docs/VOICE.md](../docs/VOICE.md) (channels, public/password, camera/screen, moderation, fallback).
- **Types:** all voice types/DTOs land in `packages/types`; the LiveKit client wrapper lives with voice UI in `apps/web` (token-fetch helpers may share `packages/sdk`) — never duplicating transport details (canon §3/§5).
- **Process (R3/R4/R5):** spec (this file) → [tasks/voice.md](../tasks/voice.md) → tests → docs → ADR (required for recording, data-channel transport, or any schema change) → implement → test → history → context → repomix → project-state.

---

*This specification is downstream of and bound by the [Cowatch Architecture Canon](../context/architecture.md), [ADR-005 LiveKit](../adr/ADR-005-livekit.md), and the [LiveKit / Voice Architecture](../docs/LIVEKIT.md). Any change to the two-plane boundary, the token model, the LiveKit↔Cowatch mapping, or the `voice_channels` collection requires an ADR + history entry + context update + repomix update (canon §10, R3/R4).*
