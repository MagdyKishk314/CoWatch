# Cowatch Architecture Canon

Last updated: 2026-06-27 (Amended 2026-06-27 — see Amendments below)

> **STATUS: CANON.** This document is the single source of truth for the Cowatch platform. Every downstream planning artifact (specs, tasks, tests, ADRs, docs) MUST comply with it. On any conflict, this document wins. Changes here require an ADR + history entry + context update + repomix update (R3/R4).

> Amended 2026-06-27: Added ADR-011 (realtime backplane), `room_bans`/`join_requests`/`activity_events` collections, `room:member:update` event, and the `playlistAuthority` room-config field per Chief Architect resolutions (B2/B3/B5/B6).

## Amendments (2026-06-27)

Per the Chief Architect's binding resolutions (see `project-state/open-questions.md`), the following additive changes were applied to this canon. These do **not** re-decide anything below; they record the resolutions in canon.

- **§2 Decisions** — Added **ADR-011** (Realtime backplane: Redis pub/sub fan-out + Redis Streams resume buffer, Mongo change streams as secondary reconciliation; sits below ADR-004's transport abstraction). Ledger row **D-011** (B2/ARCH OQ-1/RT OQ-1/DEPLOY OQ-1).
- **§3 / §4 Collections** — Added three collections to the inventory and data-model conventions: **`room_bans`** (durable bans that outlive membership deletion; unique `(roomId,userId)` + optional `expiresAt` TTL), **`join_requests`** (pending join-approval queue; partial-unique `(roomId,userId)` where `status=pending` + ~10 min `expiresAt` TTL), **`activity_events`** (append-only social feed, distinct from notifications; `(userId,createdAt)` index, 180 d TTL). Also confirmed **`role_assignments`** and **`votes`** are part of the canonical inventory (B3/B4; PERM OQ-2/OQ-4).
- **§3 Events** — Added **`room:member:update`** (server→client, no ack, ordered per-topic by `meta.seq`, buffered in the resume ring) for member-state changes without join/leave (mute, timeout, role change). Ratified `room:playlist:*` (queue mutations live in the `room` namespace, not a top-level `playlist` namespace) and the additive `room:member:kick|ban|mute|role` C→S intents (B5; PERM OQ-3; EVENTS OQ-1/OQ-2).
- **§6 Permission Model** — Added **`playlistAuthority`** as a first-class `SyncAuthority`-typed per-room field, configured independently of playback `syncAuthority`; gates `room:playlist:*` for Members (Owner/Mod bypass; Members also blocked when `playlistLock=on`). Clarified **`chatLock=on` suppresses both Guest and Member** chat (Owner/Moderator exempt; below-Mod sends rejected with `CHAT_LOCKED`) (B6/PERM OQ-5; PERM OQ-1).

---

## 1. Glossary of Core Domain Terms

| Term | Definition |
|---|---|
| **User** | An account. Subtypes by `kind`: `registered` (email/password or OAuth), `guest` (ephemeral, no durable credentials). Carries profile, presence, social graph. |
| **Session (Device Session)** | An authenticated login on one device. Holds a refresh-token family, device metadata, `lastSeenAt`. Revocable independently. NOT a watch room. |
| **Room** | A persistent or temporary space where members watch synchronized media. Owns membership, playback state, playlist, chat, and voice channels. Visibility: `public` \| `private` \| `password`. |
| **Membership** | The relationship of one User to one Room: role, join time, mute/ban/timeout state. The unit the permission model operates on. |
| **Playlist** | The ordered queue of media bound to a Room. Contains `QueueItem`s. |
| **QueueItem** | One media entry (YouTube video) in a Playlist: provider id, title, duration, addedBy, votes, position. |
| **PlaybackState** | The server-authoritative sync record for a Room: current item, `positionMs`, `isPlaying`, `rate`, `serverEpochMs`, authority mode. |
| **Message** | A chat message. Channel-scoped: a Room channel or a DM thread. May carry reactions, mentions, attachments (GIF/emoji). |
| **Notification** | A user-targeted event surfaced in the notification feed (see types below). |
| **VoiceChannel** | A LiveKit-backed audio/video/screen-share channel inside a Room. Visibility `public` \| `password`. |
| **Presence** | A User's realtime status: `online` \| `idle` \| `dnd` \| `offline`, plus current activity (e.g. in-room). |
| **Friendship** | A mutual, accepted relationship between two Users. Pending state is a `FriendRequest`. |
| **FriendRequest** | A directed, pending invitation from one User to another. |
| **Block** | A directed suppression: blocker hides/ignores blocked across social surfaces. |
| **InviteLink** | A shareable token granting entry to a Room (optionally expiring / single-use). |
| **ActivityFeed** | The chronological stream of social events relevant to a User. |
| **Notification types** | `friend.online`, `friend.room_started`, `friend.invitation`, `mention`, `dm`, `room.ownership_transfer`, `room.user_joined`. |

---

## 2. Canonical Architecture Decisions (one line + ADR id)

- **ADR-001** — Monorepo via **Turborepo + pnpm workspaces**; shared packages, single dependency graph, cached task pipeline. *Rationale: one atomic versioned codebase across 4 apps + 8 packages.*
- **ADR-002** — Backend on **NestJS** (REST + WebSocket gateways + JWT + OAuth); **Express adapter is forbidden as an app framework** — use Nest's platform. *Rationale: modular DI, decorators, first-class WS/guards.*
- **ADR-003** — **Prisma ORM over MongoDB** (document-oriented). *Rationale: typed client + migrations workflow while staying NoSQL.*
- **ADR-004** — **Custom Realtime abstraction layer** with a replaceable transport. *Rationale: avoid lock-in; native WS on VPS today, serverless adapters later.*
- **ADR-005** — **LiveKit** for voice/video/screen share. *Rationale: SFU, scalable WebRTC, data channels as a future transport.*
- **ADR-006** — **Electron + electron-builder** desktop app (PiP, push, HW accel, auto-update, IPC). *Rationale: native shell reusing the web app.*
- **ADR-007** — **Server-authoritative playback sync** (drift target < 500 ms). *Rationale: deterministic single source of truth for the clock.*
- **ADR-008** — **JWT access tokens + rotating refresh tokens**, httpOnly refresh cookie, device sessions, TOTP 2FA. *Rationale: short-lived access + revocable rotating refresh.*
- **ADR-009** — **MinIO** S3-compatible object storage (avatars, room assets, uploads, thumbnails, caches). *Rationale: self-hostable, S3 API portability.*
- **ADR-010** — **Docker-first** delivery; every service runs in Docker across local / VPS / Vercel / production. *Rationale: reproducible parity from dev to prod.*
- **ADR-011** — **Realtime backplane: Redis pub/sub (cross-instance fan-out) + Redis Streams (resume buffer), Mongo change streams as secondary reconciliation.** Sits *below* ADR-004's transport abstraction; serverless adapters (Durable Objects, etc.) swap the bus without touching feature code. Per-room single-writer playback authority via Redis lock `playback:lock:{roomId}` + monotonic `seq`. *Rationale: load-bearing multi-instance dependency; promoted from an ADR-004 implementation detail to its own ratified decision (D-011).*

> Every ADR file lives at `adr/ADR-NNN-kebab-title.md`. No architecture change ships without one (R3).

---

## 3. Naming Conventions

**Files / folders**
- Source files: `kebab-case.ts` (e.g. `room.service.ts`, `playback-clock.util.ts`). NestJS suffixes mandatory: `.module.ts`, `.controller.ts`, `.service.ts`, `.gateway.ts`, `.guard.ts`, `.dto.ts`, `.schema.ts`, `.spec.ts`.
- React components: `PascalCase.tsx`; hooks `useCamelCase.ts`; Zustand stores `camelCase.store.ts`.
- One feature folder per domain; barrel `index.ts` per package only.
- Folders: `kebab-case`. Apps: `apps/{web,desktop,server,landing}`. Packages: `packages/{ui,auth,database,realtime,social,sdk,shared,types}`.

**NestJS modules** — one module per bounded context: `AuthModule`, `UsersModule`, `RoomsModule`, `MembershipsModule`, `PlaylistModule`, `PlaybackModule`, `ChatModule`, `SocialModule`, `NotificationsModule`, `VoiceModule`, `DiscoveryModule`, `StorageModule`, `RealtimeModule`. Class `XxxModule`, folder `apps/server/src/modules/xxx/`.

**REST routes** — versioned, plural, kebab, resource-nested: base `/<host>/api/v1`. Examples: `GET /api/v1/rooms`, `POST /api/v1/rooms`, `GET /api/v1/rooms/:roomId/members`, `POST /api/v1/rooms/:roomId/playlist/items`, `POST /api/v1/auth/refresh`, `GET /api/v1/users/:userId`, `GET /api/v1/me`. Verbs never appear in paths; use HTTP methods. Sub-actions that are not CRUD use a trailing action segment: `POST /api/v1/rooms/:roomId/ownership/transfer`.

**Realtime event names** — `namespace:entity:action`, lowercase, colon-delimited. Canonical namespaces: `room`, `playback`, `chat`, `presence`, `social`, `notification`, `voice`, `system`. Examples:
- `playback:play`, `playback:pause`, `playback:seek`, `playback:rate`, `playback:sync` (server heartbeat)
- `room:member:join`, `room:member:leave`, `room:member:update`, `room:ownership:transfer`, `room:settings:update`
- `room:member:update` (S→C only, no ack, ordered per-topic by `meta.seq`, buffered in the resume ring) — member-state change **without** join/leave (mute, timeout, role change). Payload `{ roomId, userId, memberId, role?, moderationState?{ muted?, mutedUntil?, timeoutUntil? }, reason? }`.
- `room:playlist:add`, `room:playlist:reorder`, `room:playlist:remove` — queue mutations live in the **`room`** namespace (entity segment `playlist`), **not** a top-level `playlist` namespace; REST stays `/rooms/:roomId/playlist/items`.
- `room:member:kick`, `room:member:ban`, `room:member:mute`, `room:member:role` — additive **C→S** moderation intents; the authoritative truth broadcast back is `room:member:leave` / `room:member:update`.
- `chat:message:new`, `chat:message:edit`, `chat:message:delete`, `chat:typing`, `chat:reaction:add`
- `presence:update`, `social:friend:request`, `social:friend:accept`, `notification:new`
- `voice:channel:join`, `voice:channel:leave`, `system:error`, `system:ack`

**MongoDB collections** — `snake_case`, plural: `users`, `sessions`, `rooms`, `memberships`, `playlists`, `queue_items`, `messages`, `dm_threads`, `notifications`, `voice_channels`, `friendships`, `friend_requests`, `blocks`, `invite_links`, `room_bans`, `join_requests`, `activity_events`, `role_assignments`, `votes`. (Prisma `@@map` enforces this.)

**TypeScript type names** — `PascalCase` for types/interfaces/enums (no `I` prefix); entity interfaces match domain term (`User`, `Room`, `QueueItem`). DTO suffix `Dto` (`CreateRoomDto`). Realtime payloads suffix `Event`/`Payload` (`PlaybackSyncEvent`). Enums `PascalCase` singular with `PascalCase` members (`RoomRole.Owner`). Shared cross-app types live in `packages/types`; never duplicated.

---

## 4. Data-Modeling Conventions (MongoDB + Prisma)

- **ObjectId strategy**: every id is `id String @id @default(auto()) @map("_id") @db.ObjectId`. All foreign keys are `String @db.ObjectId`. **Ids are strings everywhere in TS** — never `ObjectId` instances cross the service boundary.
- **Embed vs reference**:
  - **Embed** when child is owned, bounded, and read with the parent: room `settings`, playback authority config, message `reactions` (capped), session device metadata.
  - **Reference** when child is large, unbounded, queried independently, or shared: `messages → room`, `queue_items → playlist`, `memberships → user/room`, `notifications → user`.
  - **Hard rule**: never embed an unbounded growing list (messages, queue items, members). These are always separate collections with a back-reference id + index.
- **Denormalization policy** (MongoDB-native, per SPEC): duplicate small, read-hot, slowly-changing fields to avoid join fan-out. Canonical denorm snapshots: `Membership.userDisplayName/userAvatarUrl`, `Room.ownerId/ownerDisplayName`, `Message.authorDisplayName/authorAvatarUrl`, `QueueItem.addedByDisplayName`, `Room.currentVideoTitle` + `Room.viewerCount` for discovery. Denormalized fields are **eventually consistent**; the owning aggregate is the source of truth and re-fans updates via realtime + background reconciliation. Every denormalized field is documented at its definition with its source.
- **Standard indexing pattern**: index every foreign key used in a query filter; compound index ordered by equality→sort→range. Mandatory indexes: `memberships (roomId, userId)` unique, `messages (roomId, createdAt)`, `notifications (userId, readAt, createdAt)`, `sessions (userId)`, `friendships (userIdA, userIdB)` unique, `rooms (visibility, isActive)` for discovery, text-eligible fields use a separate search index. Soft-delete via `deletedAt: DateTime?`; queries filter it.
- **Timestamps**: every collection has `createdAt DateTime @default(now())` and `updatedAt DateTime @updatedAt`.
- **Moderation & social-feed collections** (added 2026-06-27, B3/B4 — data-model change, no ADR):
  - `room_bans` — durable bans that **outlive membership deletion**. Unique `(roomId, userId)`; optional `expiresAt DateTime?` with a TTL index for temp-bans (permanent bans omit `expiresAt`).
  - `join_requests` — pending join-approval queue. **Partial-unique** `(roomId, userId)` where `status = pending` (one open request per user/room) + `expiresAt` TTL ≈ **10 min**; partial uniqueness is created out-of-band (Prisma can't express it declaratively).
  - `activity_events` — append-only social feed, **distinct from `notifications`**. Index `(userId, createdAt)`; **180-day** `expiresAt`/`createdAt` TTL.
  - `role_assignments` — immutable role-change audit. Indexes `(roomId, createdAt)` + `(membershipId, createdAt)`; **durable, no TTL**, append-only.
  - `votes` — individual queue-item votes. Unique `(queueItemId, userId, kind)` + index `(queueItemId, kind)`.
- Prisma schema is the single owner of the data model, living in `packages/database/prisma/schema.prisma`; the generated client is re-exported through `packages/database`.

---

## 5. Realtime Transport Abstraction (ADR-004)

Defined in `packages/realtime`. Apps depend only on the interface, never a concrete transport.

```ts
// Standard message envelope — EVERY realtime frame, both directions.
export interface RealtimeEnvelope<T = unknown> {
  v: 1;                         // protocol version
  id: string;                   // message id (ulid)
  type: string;                 // namespaced event, e.g. "playback:sync"
  room?: string;                // target room/channel id (topic)
  ts: number;                   // sender epoch ms
  corr?: string;                // correlation id (request/ack/error pairing)
  data: T;                      // typed payload from packages/types
}

export type ConnectionState =
  | 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface PresenceState {
  userId: string;
  status: 'online' | 'idle' | 'dnd' | 'offline';
  activity?: { kind: 'room'; roomId: string } | null;
}

export interface Subscription { unsubscribe(): void; }

export interface RealtimeTransport {
  connect(opts: { url: string; token: string }): Promise<void>;
  disconnect(): Promise<void>;
  send<T>(envelope: RealtimeEnvelope<T>): void;            // fire-and-forget
  request<TReq, TRes>(                                      // ack-correlated
    envelope: RealtimeEnvelope<TReq>, timeoutMs?: number
  ): Promise<RealtimeEnvelope<TRes>>;
  subscribe<T>(
    type: string,
    handler: (e: RealtimeEnvelope<T>) => void,
    opts?: { room?: string }
  ): Subscription;
  // Presence
  setPresence(state: PresenceState): void;
  onPresence(handler: (states: PresenceState[]) => void): Subscription;
  // Lifecycle / reconnection
  getState(): ConnectionState;
  onStateChange(handler: (s: ConnectionState) => void): Subscription;
}
```

- **Reconnection**: transport owns exponential backoff with jitter (base 500 ms, cap 15 s), auto re-subscribe of all topics, and a **resume** handshake replaying missed events by `lastEnvelopeId` where the server buffer allows; otherwise the client requests a fresh `playback:sync` + room snapshot.
- **Adapters**: each implements `RealtimeTransport`. `NativeWsTransport` (VPS, default) wraps a single WS multiplexed by `room`. Future adapters: `LiveKitDataChannelTransport`, `DurableObjectTransport`, `VercelEdgeTransport`. Selection is config-driven (`REALTIME_TRANSPORT`); apps are unaware of the choice.
- **Server side**: NestJS WS gateways speak the identical envelope. Server is authoritative for `playback:*` and stamps `serverEpochMs`.

---

## 6. Permission Model

**Roles** (enum `RoomRole`): `Owner`, `Moderator`, `Member`, `Guest`.

| Permission | Owner | Moderator | Member | Guest |
|---|:--:|:--:|:--:|:--:|
| kick | ✓ | ✓ | ✗ | ✗ |
| ban | ✓ | ✓ | ✗ | ✗ |
| mute / timeout | ✓ | ✓ | ✗ | ✗ |
| playback control | ✓ | ◐ | ◐ | ✗ |
| playlist control (add/reorder/remove) | ✓ | ✓ | ◐ | ✗ |
| chat lock (toggle) | ✓ | ✓ | ✗ | ✗ |
| playlist lock (toggle) | ✓ | ✓ | ✗ | ✗ |
| join approval | ✓ | ✓ | ✗ | ✗ |
| change room settings | ✓ | ✗ | ✗ | ✗ |
| assign moderators / transfer ownership | ✓ | ✗ | ✗ | ✗ |
| send chat | ✓ | ✓ | ✓ | ◐ |

◐ = gated by room config. **Sync-authority modes** (`SyncAuthority`): `owner_only` \| `owner_moderators` \| `everyone` — these decide who holds the ◐ on **playback control** and (separately configurable) **playlist control**. Guests' chat is gated by `chatLock`.

**Per-room authority fields** (each `SyncAuthority`-typed, configured **independently**):
- `syncAuthority` — gates mutating `playback:*` (who may control playback).
- `playlistAuthority` — first-class per-room field mirroring `SyncAuthority` (`owner_only` \| `owner_moderators` \| `everyone`); gates `room:playlist:*` for **Members** (Owner/Moderator always bypass). Members are **additionally** blocked when `playlistLock=on`. Independent of `syncAuthority`. *(Added 2026-06-27, B6 — resolves PERMISSIONS OQ-5. Canonical name = `playlistAuthority`; replaces the prior `syncAuthorityPlaylist` working name.)*

**Chat lock semantics** (`chatLock`, 2026-06-27, PERM OQ-1): `chatLock=on` suppresses chat for **both Guest and Member** (Discord lock semantics). **Owner/Moderator are exempt** and can still speak. Below-Moderator sends while locked are rejected with code `CHAT_LOCKED`.

**Sync-authority modes** (per-room, per-SPEC): `owner_only`, `owner_moderators`, `everyone`. Mutating playback events are accepted by the server only from members whose effective role satisfies the room's mode; all others receive `system:error` with code `FORBIDDEN_SYNC`.

**Ownership-transfer algorithm** (on owner disconnect/leave):
1. If the owner is reachable (grace window, default 30 s) → prompt the owner to nominate a successor; on response, transfer.
2. Else → transfer to the **oldest-joined active Moderator**.
3. Else → transfer to the **oldest-joined active Member**.
4. Else (room empty) → if `temporary`, schedule room teardown; if `permanent`, room persists ownerless until a qualifying member returns, then step 2/3 re-runs.
Transfer is atomic server-side, emits `room:ownership:transfer` + `notification.new (room.ownership_transfer)`, and re-derives the permission matrix for all members.

---

## 7. Sync Algorithm

- **Server-authoritative clock (ADR-007)**: server holds `PlaybackState { itemId, positionMs, isPlaying, rate, serverEpochMs }`. Clients never trust each other.
- **Effective position** at any client time `now`: `effectiveMs = positionMs + (isPlaying ? (now - serverEpochMs) * rate : 0)`, after correcting for the client↔server clock offset measured via a ping/pong RTT exchange on connect and periodically.
- **Heartbeat**: server emits `playback:sync` every **2 s** (and immediately on any state change) carrying the full `PlaybackState`. Clients recompute target and compare to local player position.
- **Drift correction**: if `|drift| < 500 ms` → no action (within target). If `500 ms ≤ |drift| < 2 s` → adjust `playbackRate` ±5–10% to glide back. If `|drift| ≥ 2 s` → hard `seek` to target.
- **Target**: steady-state drift **< 500 ms** across clients.
- **Synced**: play, pause, seek, rewind, fast-forward, playback speed (`rate`), current item / autoplay advance, skip-vote outcomes.
- **NOT synced** (per-client local): volume, subtitle/caption selection, audio track, video quality/resolution, picture-in-picture.
- **Authority enforcement**: only authority-qualified members may emit mutating `playback:*`; the server validates, applies, re-stamps `serverEpochMs`, and broadcasts. Late joiners receive an immediate `playback:sync` snapshot.

---

## 8. Auth / Token Model (ADR-008)

- **Access token**: JWT, **15-minute** lifetime, sent as `Authorization: Bearer`. Claims: `sub` (userId), `sid` (sessionId), `kind` (`registered`\|`guest`), `roles`, `iat`, `exp`. Signed RS256.
- **Refresh token**: opaque, rotating, **30-day** lifetime, stored hashed server-side as a per-session token family. Delivered as an **httpOnly, Secure, SameSite=Strict** cookie scoped to `/api/v1/auth`.
- **Rotation**: each `POST /api/v1/auth/refresh` issues a new access+refresh pair and invalidates the prior refresh. **Reuse detection**: presenting a consumed refresh token revokes the entire session family (theft response).
- **Device sessions**: one `Session` per device (UA, IP-region, label, `lastSeenAt`). `GET /api/v1/auth/sessions`, `DELETE /api/v1/auth/sessions/:id` (revoke one), `DELETE /api/v1/auth/sessions` (revoke all others). Logout revokes the current session.
- **Flows**: email/password, Google OAuth (`/api/v1/auth/oauth/google`), guest upgrade-to-registered, email verification, password reset (single-use tokens), **TOTP 2FA** (enroll/verify/disable; recovery codes).
- **Guests**: short-lived session, no refresh cookie persistence beyond browser session, limited permissions (`Guest` role defaults).

---

## 9. Directory / Path Map & Doc Cross-Links

```
cowatch/
  apps/
    web/        # React + Vite + Tailwind + shadcn/ui + Zustand + TanStack Query
    desktop/    # Electron + electron-builder (wraps web)
    server/     # NestJS (REST + WS gateways)  -> src/modules/<context>/
    landing/    # marketing site
  packages/
    ui/         # shared shadcn/Radix components
    auth/       # token/session client + guards helpers
    database/   # Prisma schema + generated client re-export
    realtime/   # RealtimeTransport + envelope + adapters
    social/     # friends/presence/dm shared logic
    sdk/        # typed API client (consumes packages/types)
    shared/     # cross-cutting utils (ids, errors, config)
    types/      # canonical TS domain + DTO + event types (SOURCE OF TRUTH for types)
  adr/          # ADR-NNN-*.md
  context/      # architecture.md (THIS), domain notes, glossary
  docs/         # human docs, per-feature documentation
  specs/        # per-feature specifications
  tasks/        # implementation task lists
  history/      # append-only decision/change log (R3)
  project-state/ # recoverable phase/progress state (R2)
  repomix/      # packed repo snapshots
  instructions/ prompts/ scripts/ docker/
```

- **Cross-link convention**: docs reference each other with **relative markdown links** from the file's own location, e.g. from `specs/auth.md` → `[canon](../context/architecture.md)`, → `[ADR-008](../adr/ADR-008-auth-tokens.md)`. ADRs link back to canon; specs link to their ADRs + canon section anchors (`../context/architecture.md#7-sync-algorithm`).
- Type names, event names, and route shapes cited in any doc MUST match this canon verbatim.

---

## 10. Cross-Cutting Non-Negotiables

- **Security baseline**: TLS everywhere; bcrypt/argon2 password hashing; RS256 JWT; httpOnly+Secure+SameSite refresh cookie; CSRF protection on cookie-auth mutations; Helmet headers; per-IP + per-user rate limiting on auth and write endpoints; strict CORS allowlist; all input validated via `class-validator` DTOs; secrets only via env/secret store, never committed; principle of least privilege on MinIO buckets (signed URLs for uploads).
- **Standard REST error envelope** (every non-2xx):
  ```json
  { "error": { "code": "ROOM_NOT_FOUND", "message": "Human readable.",
    "details": {}, "correlationId": "01J...", "timestamp": "2026-06-27T..." } }
  ```
  Success envelope: bare resource or `{ "data": ..., "meta": { "page": ... } }` for collections. `code` is a stable SCREAMING_SNAKE enum.
- **Realtime error**: `system:error` envelope with the same `code` vocabulary; `corr` ties it to the originating request.
- **API versioning**: URI-versioned (`/api/v1`). Breaking changes → `/api/v2`; old version deprecated per policy, never silently mutated. Realtime envelope carries `v`.
- **Observability**: structured JSON logs (pino), every request/event carries a `correlationId` (ULID) propagated through HTTP header `x-correlation-id` and envelope `corr`; metrics (Prometheus-compatible) and health endpoints (`/health/live`, `/health/ready`) on every service; tracing spans across HTTP→service→WS.
- **ID / correlation conventions**: persistent entity ids = Mongo `ObjectId` (string in TS). Realtime/message ids and correlation ids = **ULID** (sortable). One `correlationId` per logical operation, shared across REST + realtime + logs.
- **Process discipline (R2–R5)**: planning artifacts precede code; every architectural change ⇒ ADR + history + context + repomix; every feature ⇒ spec → tasks → tests → docs → (ADR) → implement → test → history → context → repomix → project-state. Coverage target **90%**.
- **Time**: all timestamps stored and transmitted in **UTC ISO-8601 / epoch ms**; clients localize for display only.
