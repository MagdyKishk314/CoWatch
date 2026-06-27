# Rooms Feature Specification

> R5 feature spec for Cowatch rooms: creation, visibility (public/private/password), permanent vs temporary lifetime, membership & roles, moderation, invite links, join approval, settings, discovery snapshots, and ownership transfer.

**Status:** Draft — Planning (Phase 2: Rooms)
**Owner agent:** Chief Architect (spec) → Backend Engineer (implementation)
**Last updated: 2026-06-27**

> **Canon compliance.** This spec is downstream of and MUST comply with the [Architecture Canon](../context/architecture.md). On any conflict, the canon wins. It implements [Canon §1 Glossary](../context/architecture.md#1-glossary-of-core-domain-terms) (`Room`, `Membership`, `InviteLink`), [Canon §6 Permission Model](../context/architecture.md#6-permission-model), and [Canon §4 Data Modeling](../context/architecture.md#4-data-modeling-conventions-mongodb--prisma). Type names, route shapes, event names, and error codes below match the canon and sibling docs **verbatim**.

**Primary references**

- Canon: [§1 Glossary](../context/architecture.md#1-glossary-of-core-domain-terms) · [§6 Permissions](../context/architecture.md#6-permission-model) · [§4 Data Modeling](../context/architecture.md#4-data-modeling-conventions-mongodb--prisma) · [§3 Naming](../context/architecture.md#3-naming-conventions) · [§10 Non-Negotiables](../context/architecture.md#10-cross-cutting-non-negotiables)
- ADR: [ADR-002 — NestJS](../adr/ADR-002-nestjs.md) (guards/decorators enforce permissions) · [ADR-003 — Prisma over MongoDB](../adr/ADR-003-prisma.md) · [ADR-004 — Realtime abstraction](../adr/ADR-004-realtime.md)
- Design docs: [PERMISSIONS.md](../docs/PERMISSIONS.md) · [API.md §3.5–3.6](../docs/API.md#35-rooms) · [EVENTS.md §5.3 room](../docs/EVENTS.md#53-rooms-room) · [DOMAIN.md §3.6 Room / §3.7 Membership](../docs/DOMAIN.md#36-room) · [DATABASE.md §4.4 rooms / §4.5 memberships](../docs/DATABASE.md#44-rooms)
- Sibling specs: [auth.spec.md](./auth.spec.md) · [sync.spec.md](./sync.spec.md) · [chat.spec.md](./chat.spec.md)

---

## 1. Overview & User Value

A **Room** is the heart of Cowatch: a persistent or temporary space where members watch synchronized media together, chat, talk in voice channels, and manage a shared playlist. Rooms own membership, playback state, playlist, chat, and voice channels (canon §1).

User value:

- **Spin up a watch party in seconds** — create a public, private, or password-protected room; choose **temporary** (auto-teardown when empty) or **permanent** (persists ownerless until someone returns).
- **Bring friends in safely** — share an **invite link** (optionally expiring / single-use), or gate entry behind **join approval**.
- **Stay in control** — Owners and Moderators **kick/ban/mute/timeout**, lock chat or the playlist, approve joins, and tune **sync/playlist authority**.
- **Never lose the room** — deterministic **ownership transfer** when the owner disconnects keeps the party going.
- **Be discoverable** — public rooms surface in discovery with name, current video, viewer count, tags, NSFW flag, and which friends are inside.

This spec covers the room lifecycle and membership/permission surface. The **playback clock** is specified in [sync.spec.md](./sync.spec.md); the **permission core** in [docs/PERMISSIONS.md](../docs/PERMISSIONS.md); **chat** in [chat.spec.md](./chat.spec.md).

---

## 2. Scope

### 2.1 In scope

- Room **CRUD**: create (creator becomes `Owner`), read (visibility-gated), update settings (Owner), delete (temporary) / archive (permanent).
- **Visibility**: `public` \| `private` \| `password` (canon §1) and **lifetime**: `temporary` \| `permanent`.
- **Membership** lifecycle: join (visibility/password/invite/approval), leave, the `(roomId, userId)` unique relationship that the permission model operates on.
- **Roles**: `Owner`, `Moderator`, `Member`, `Guest`; assign/revoke Moderator (Owner-only).
- **Moderation**: kick, ban/unban, mute/unmute, timeout — gated by canon §6 + the rank rule.
- **Invite links**: create, list, revoke, join-by-invite (optionally expiring/single-use).
- **Join approval** flow: `JoinRequest` queue, approve/reject.
- **Room settings** (embedded): `syncAuthority`, `playlistAuthority`, `chatLock`, `playlistLock`, `joinApproval`, plus `nsfw`, `tags`, `name`, `visibility`.
- **Ownership transfer** (manual + automatic on owner disconnect) per [Canon §6](../context/architecture.md#6-permission-model).
- **Discovery snapshot fields** the room owns (`viewerCount`, `currentVideoTitle`, denormalized owner) — the discovery *query surface* is Phase 7.

### 2.2 Out of scope (owned elsewhere)

- **Playback sync clock** and `playback:*` mutations → [sync.spec.md](./sync.spec.md) / [docs/SYNC.md](../docs/SYNC.md).
- **Playlist/queue item mechanics** (add/reorder/vote/skip) → Playlist (Phase 3); this spec owns only the `playlistLock`/`playlistAuthority` *gates*.
- **Chat content, reactions, typing** → [chat.spec.md](./chat.spec.md).
- **Voice channels A/V** → [docs/LIVEKIT.md](../docs/LIVEKIT.md) (this spec references voice-channel *membership* only at the room boundary).
- **Discovery & search query endpoints** → Phase 7 (this spec only guarantees the denormalized read-hot fields exist and stay fresh).
- **Permission decision function** (`PermissionService.can`) → [docs/PERMISSIONS.md](../docs/PERMISSIONS.md); this spec consumes it.

---

## 3. Functional Requirements

| # | Requirement |
|---|---|
| **FR-1** | `POST /rooms` creates a `Room`; the caller becomes `Owner` via a `Membership(role=Owner)`. Requires `Bearer (registered)` + verified email (`@RequireVerifiedEmail()`) + `Idempotency-Key`. Guests cannot create rooms (`403 GUEST_FORBIDDEN`). |
| **FR-2** | A room has `visibility ∈ {public, private, password}` and `kind ∈ {temporary, permanent}` (a.k.a. `lifetime`). `password` rooms store a **hashed** password (argon2id); the plaintext is never persisted or returned. |
| **FR-3** | Room **settings** are embedded (canon §4): `syncAuthority`, `playlistAuthority` (both `SyncAuthority`), `chatLock`, `playlistLock`, `joinApproval` (all default `false`/`owner_moderators` per [PERMISSIONS.md §4](../docs/PERMISSIONS.md#4-sync-authority-modes)), plus `nsfw`, `tags[]`, `name`. |
| **FR-4** | `GET /rooms/:roomId` returns room detail + a **playback snapshot** + the caller's membership, **visibility-gated**: private rooms return `404 ROOM_NOT_FOUND` to non-members (no existence leak); password rooms reveal metadata but require the password to join. |
| **FR-5** | `PATCH /rooms/:roomId` updates settings; **Owner-only** (`change room settings`, canon §6). Non-owners → `403 OWNER_REQUIRED`. Validated via `class-validator` DTO. |
| **FR-6** | `DELETE /rooms/:roomId` (Owner-only): a `temporary` room is hard-deleted; a `permanent` room is **archived** (soft-delete `deletedAt`, removed from discovery, history retained). |
| **FR-7** | `POST /rooms/:roomId/join` creates a `Membership`. Behavior branches on visibility/password/ban/`joinApproval`: public → join; password → password required; banned → `403 BANNED_FROM_ROOM`; `joinApproval=on` → `202 JOIN_PENDING_APPROVAL` (creates a `JoinRequest`). A registered user joins as `Member`; a `guest`-kind user joins as `Guest`. |
| **FR-8** | `POST /rooms/:roomId/leave` removes the caller's `Membership` and broadcasts `room:member:leave`. If the leaver is the `Owner`, the **ownership-transfer** algorithm (FR-15) runs. |
| **FR-9** | **Invite links**: `POST /rooms/:roomId/invites` (Moderator+) mints an `InviteLink` token (optionally `expiresAt` and/or single-use `maxUses=1`); `GET` lists; `DELETE` revokes. `POST /rooms/join-by-invite` consumes a token to join (respecting bans + capacity); an expired/consumed token → `410 INVITE_EXPIRED`. |
| **FR-10** | **Join approval**: `GET /rooms/:roomId/join-requests` (Moderator+) lists pending; `approve` creates the `Membership` + emits `room:member:join`; `reject` denies (reason optional). Pending requests expire after a TTL (default 10 min). Duplicate pending requests by one user collapse to one. |
| **FR-11** | **Role management**: `PATCH /rooms/:roomId/members/:userId/role` (Owner-only) promotes/demotes between `Moderator`/`Member`. `Owner` is set only via ownership transfer. The rank rule forbids acting on equal-or-higher rank. |
| **FR-12** | **Moderation — kick**: `POST /rooms/:roomId/members/:userId/kick` (Moderator+) removes the membership and drops the WS room subscription; the target MAY re-join unless banned. Broadcasts `room:member:leave {reason:'kicked'}`. |
| **FR-13** | **Moderation — ban/unban**: `POST .../ban` persists a durable deny record (`room_bans`, see §4) and kicks if present; `DELETE /rooms/:roomId/bans/:userId` lifts it. Bans block all future joins and invite entry. Optional `expiresAt` for temp-bans. |
| **FR-14** | **Moderation — mute/timeout**: `POST .../mute` sets indefinite chat+voice mute on the `Membership`; `POST .../timeout` sets an auto-expiring `timeoutUntil` suppressing all interaction; `DELETE .../mute` unmutes. All broadcast `room:member:update`. Voice mute propagates to LiveKit. |
| **FR-15** | **Ownership transfer** runs on owner disconnect/leave per [Canon §6](../context/architecture.md#6-permission-model): (1) prompt reachable owner within a 30-s grace to nominate a successor; else (2) oldest-joined active Moderator; else (3) oldest-joined active Member; else (4) temporary → teardown, permanent → ownerless (re-run on a qualifying member's return). Transfer is **atomic**, idempotent under double-trigger, emits `room:ownership:transfer` + a `room.ownership_transfer` notification, and re-derives the permission matrix for all members. |
| **FR-16** | A reachable Owner MAY transfer proactively via `POST /rooms/:roomId/ownership/transfer { toUserId }` (Owner-only; target must be an active `Member`+). |
| **FR-17** | **Denormalized read-hot fields** on `Room` are kept fresh (canon §4): `ownerId`/`ownerDisplayName`, `viewerCount`, `currentVideoTitle`, `visibility`, `isActive`, `tags`, `nsfw` — re-fanned via realtime + background reconciliation; the owning aggregate is the source of truth. |
| **FR-18** | All room mutations enforce permissions identically across **REST and WS** via the shared `PermissionService` (canon §6); every denial uses the canon error envelope / `system:error` with a stable code and propagated `correlationId`. An active room has **exactly one Owner** (or explicit `ownerless` for permanent rooms). |

---

## 4. Data Model Touchpoints

> Source of truth: `packages/database/prisma/schema.prisma`; entities in [DOMAIN.md](../docs/DOMAIN.md), schema in [DATABASE.md](../docs/DATABASE.md). This section enumerates touchpoints only.

| Collection (`@@map`) | Role | Key fields / indexes | Ref |
|---|---|---|---|
| `rooms` | Room aggregate | `name`, `visibility`, `kind/lifetime`, `passwordHash?`, `nsfw`, `tags[]`, embedded `settings`, denorm `ownerId/ownerDisplayName/viewerCount/currentVideoTitle`, `isActive`, `deletedAt?`; index `(visibility, isActive)` (canon-mandatory for discovery) | [DOMAIN §3.6](../docs/DOMAIN.md#36-room) · [DATABASE §4.4](../docs/DATABASE.md#44-rooms) |
| `memberships` | User↔Room relationship; the **permission unit** | `roomId`, `userId`, `role`, `joinedAt`, embedded mute/timeout state (`mutedAt`, `timeoutUntil`), denorm `userDisplayName/userAvatarUrl`; **unique `(roomId, userId)`** (canon-mandatory) | [DOMAIN §3.7](../docs/DOMAIN.md#37-membership) · [DATABASE §4.5](../docs/DATABASE.md#45-memberships) |
| `invite_links` | Shareable entry tokens | `roomId`, `tokenHash`, `expiresAt?`, `maxUses?`, `useCount`, `createdBy` | [DOMAIN §3.15](../docs/DOMAIN.md#315-invitelink) |
| `room_bans` *(additive)* | Durable deny records | `roomId`, `userId`, `expiresAt?`, `reason?`; **unique `(roomId, userId)`** | [PERMISSIONS.md §7.4 / OQ-2](../docs/PERMISSIONS.md#74-persistence-model-mongodb-canon-4) |
| `join_requests` *(additive)* | Approval waiting room | `roomId`, `userId`, `status`, `createdAt`; partial-unique `(roomId, userId)` where `status=pending` | [PERMISSIONS.md §8 / OQ-4](../docs/PERMISSIONS.md#8-end-to-end-join-approval-flow) |

**Canon compliance:**

- **Embed** room `settings` (owned, bounded, read-with-parent) and per-membership mute/timeout state (canon §4).
- **Reference** memberships, messages, queue items, invite links, bans, join requests — never embed unbounded lists (canon §4 hard rule).
- **Denormalization registry** (canon §4 + [DOMAIN §7](../docs/DOMAIN.md#7-denormalization-snapshot-registry)): `Room.ownerDisplayName` ← `User.displayName`; `Room.currentVideoTitle` ← active `QueueItem.title`; `Room.viewerCount` ← live membership/presence count; `Membership.userDisplayName/userAvatarUrl` ← `User`. All eventually consistent; re-fanned via realtime + reconciliation.

> **New-collection note (R3/R4).** `room_bans` and `join_requests` are **not** in the canon §4 collection list. They are required for durable, independently-queried ban/approval records and must be ratified via **ADR + history + context + repomix** (see [PERMISSIONS.md OQ-2/OQ-4](../docs/PERMISSIONS.md#9-open-questions-with-recommendations)) before implementation. Tracked in Open Questions (OQ-R1).

---

## 5. API & Event Surface

### 5.1 REST (full catalog in [API.md §3.5 Rooms](../docs/API.md#35-rooms) & [§3.6 Memberships](../docs/API.md#36-memberships--roles))

| Method & Path | Permission | Purpose |
|---|---|---|
| `POST /rooms` | `Bearer (registered)` + verified + Idem | Create room (caller → Owner). |
| `GET /rooms/:roomId` | visibility-gated | Detail + playback snapshot + my membership. |
| `PATCH /rooms/:roomId` | `Member:Owner` | Update settings. |
| `DELETE /rooms/:roomId` | `Member:Owner` | Delete (temp) / archive (perm). |
| `POST /rooms/:roomId/join` | `Bearer` | Join (visibility/password/approval). |
| `POST /rooms/:roomId/leave` | `Member:Guest` | Leave (may trigger transfer). |
| `GET /rooms/:roomId/playback` | `Member:Guest` | `PlaybackState` snapshot (mutations realtime-only → [sync.spec.md](./sync.spec.md)). |
| `POST /rooms/:roomId/ownership/transfer` | `Member:Owner` | Explicit transfer. |
| `GET/POST/DELETE /rooms/:roomId/invites[/:inviteId]` | `Member:Moderator` | Manage invite links. |
| `POST /rooms/join-by-invite` | `Bearer` | Join via invite token. |
| `GET /rooms/:roomId/join-requests` | `Member:Moderator` | List pending joins. |
| `POST /rooms/:roomId/join-requests/:reqId/approve\|reject` | `Member:Moderator` | Approve/reject join. |
| `GET /rooms/:roomId/members[/:userId]` | `Member:Guest` | List / detail. |
| `PATCH /rooms/:roomId/members/:userId/role` | `Member:Owner` | Promote/demote. |
| `POST /rooms/:roomId/members/:userId/kick\|ban\|mute\|timeout` | `Member:Moderator` | Moderation actions. |
| `DELETE /rooms/:roomId/bans/:userId` | `Member:Moderator` | Unban. |
| `DELETE /rooms/:roomId/members/:userId/mute` | `Member:Moderator` | Unmute. |

### 5.2 Realtime (`room` namespace — [EVENTS.md §5.3](../docs/EVENTS.md#53-rooms-room) & §5.11)

| Event | Direction | Purpose |
|---|---|---|
| `room:member:join` | C→S ack / S→C | Join (server verifies visibility/password/invite/approval; ack returns the [`RoomSnapshot`](../docs/EVENTS.md#room-snapshot)) / broadcast of a joiner (denorm identity). |
| `room:member:leave` | C→S ack / S→C | Graceful leave / broadcast (`reason: left\|disconnected\|kicked\|banned`). |
| `room:member:update` | S→C | Membership delta: `role` change, `muted`, `timeoutUntil`. |
| `room:settings:update` | C→S ack / S→C | Owner-only settings change; committed settings broadcast. |
| `room:ownership:transfer` | C→S ack / S→C | Owner nomination during grace / transfer-algorithm broadcast; re-derives matrix. |
| `room:presence:sync` | S→C | Full room roster snapshot on join / coarse change. |
| `room:member:kick\|ban\|mute\|role` | C→S ack | Moderation intents → truth via `room:member:leave`/`room:member:update`. |

> **Event-name note (R3/R4).** `room:member:update` and `room:member:kick|ban|mute|role` conform to the `namespace:entity:action` grammar but extend canon §3's enumerated examples. Ratify additively via [PERMISSIONS.md OQ-3](../docs/PERMISSIONS.md#9-open-questions-with-recommendations) / [EVENTS.md OQ-2](../docs/EVENTS.md#11-open-questions). All `playback:*` and `room:playlist:*` events belong to sibling specs.

---

## 6. Permissions

Authorization is **Membership-scoped** (canon §6); the matrix and `PermissionService` are defined in [docs/PERMISSIONS.md](../docs/PERMISSIONS.md). Room-relevant rows:

| Permission | Owner | Moderator | Member | Guest | Gating config |
|---|:--:|:--:|:--:|:--:|---|
| kick / ban / mute / timeout | ✓ | ✓ | ✗ | ✗ | — |
| chat lock toggle / playlist lock toggle | ✓ | ✓ | ✗ | ✗ | — |
| join approval (approve/deny) | ✓ | ✓ | ✗ | ✗ | — |
| change room settings | ✓ | ✗ | ✗ | ✗ | — |
| assign moderators / transfer ownership | ✓ | ✗ | ✗ | ✗ | — |
| playback control | ✓ | ◐ | ◐ | ✗ | `syncAuthority` → [sync.spec.md](./sync.spec.md) |
| playlist control | ✓ | ✓ | ◐ | ✗ | `playlistAuthority` + `playlistLock` |
| send chat | ✓ | ✓ | ✓ | ◐ | `chatLock` → [chat.spec.md](./chat.spec.md) |

Enforcement rules (canon §6 / [PERMISSIONS.md](../docs/PERMISSIONS.md)):

- **Two axes**: a permission is granted iff **role** allows it AND **room config** (for ◐) allows it.
- **Rank rule** (`canActOn`): moderation/role changes require `rank(actor) > rank(target)` (`Owner=3 > Moderator=2 > Member=1 > Guest=0`); else `CANNOT_ACT_ON_EQUAL_OR_HIGHER`.
- **Transport parity**: REST controllers and WS gateways invoke the identical `PermissionService`; no transport bypasses a check.
- **`chatLock=on`** suppresses chat for Guest **and** Member ([PERMISSIONS.md OQ-1](../docs/PERMISSIONS.md#9-open-questions-with-recommendations) recommendation); Owner/Moderator may still speak.

Standard codes: `FORBIDDEN`, `OWNER_REQUIRED`, `CANNOT_ACT_ON_EQUAL_OR_HIGHER`, `ROOM_NOT_FOUND`, `JOIN_PENDING_APPROVAL`, `BANNED_FROM_ROOM`, `ROOM_PASSWORD_REQUIRED`, `ALREADY_MEMBER`, `ROOM_FULL`, `INVITE_EXPIRED` (canon §10, [PERMISSIONS.md §5.5](../docs/PERMISSIONS.md#55-standard-error-codes-screaming_snake-canon-10), [API.md §2.11](../docs/API.md#211-common-error-codes)).

---

## 7. Implementation Tasks

> Detailed breakdown lands in `tasks/rooms.tasks.md` (Phase 2). High-level decomposition:

1. **Modules** — scaffold `RoomsModule` and `MembershipsModule` at `apps/server/src/modules/{rooms,memberships}/` with controllers, services, gateways.
2. **Prisma models** — `rooms` (embedded `settings`, denorm fields, `(visibility, isActive)` index), `memberships` (unique `(roomId, userId)`, embedded mute/timeout, denorm identity), `invite_links`; **plus** (pending R3/R4) `room_bans`, `join_requests`.
3. **Shared types** — `Room`, `RoomSummary`, `RoomSettings`, `RoomVisibility`, `RoomLifetime`, `Membership`, `RoomSnapshot`, `InviteLink`, `JoinRequest`, DTOs (`CreateRoomDto`, `UpdateRoomSettingsDto`, `JoinRoomDto`, `ModerationActionDto`, …) in `packages/types`.
4. **`PermissionService`** — implement `can`/`canActOn` per [PERMISSIONS.md §5.2](../docs/PERMISSIONS.md#52-the-shared-core-permissionservice); `RoomMembershipGuard`, `RoomPermissionGuard`, `@RequirePermission()` decorator.
5. **Room CRUD** — create (Owner membership + idempotency), read (visibility gating + 404 hiding), update (Owner DTO validation), delete/archive by lifetime.
6. **Join/leave** — password verify (argon2id), ban check, capacity check, `Member`/`Guest` role assignment, leave + transfer trigger; `RoomSnapshot` assembly (membership, playlist, playback, voice roster).
7. **Invite links** — mint/list/revoke, join-by-invite consumption with `useCount`/`expiresAt`/single-use enforcement.
8. **Join approval** — `JoinRequest` queue, approve/reject, TTL expiry sweep, dedupe pending.
9. **Moderation** — kick/ban/unban/mute/unmute/timeout with `canActOn`; embed mute/timeout state; `room_bans` durability; lazy + sweep expiry; LiveKit voice-mute propagation hook.
10. **Ownership transfer** — implement the §6 algorithm: grace timer, nominee prompt, fallback ordering, atomic compare-and-set commit, idempotency guard, `ownerless` state, re-derive matrix; emit `room:ownership:transfer` + notification.
11. **Realtime gateway** — `room:*` handlers with permission parity, topic subscribe/unsubscribe, roster/presence sync, denormalized broadcast payloads.
12. **Denormalization reconciliation** — write-through on owner/title/viewer changes + a background reconciler.
13. **Cross-cutting** — `write` rate bucket, `room-join` strict sub-bucket for password brute-force ([API.md OQ-7](../docs/API.md#5-open-questions)), `correlationId` propagation, structured logging.
14. **Tests & docs** — unit/integration/e2e (§9); update [docs/PERMISSIONS.md](../docs/PERMISSIONS.md) cross-links, history + context + repomix + project-state per the per-feature workflow.

---

## 8. Test Plan

Coverage target **90%** (canon §10).

### 8.1 Unit
- `PermissionService.can`: every (`RoomRole`, `RoomPermissionConfig`) maps to the §6 matrix incl. all ◐ resolutions ([PERMISSIONS.md AC-1](../docs/PERMISSIONS.md#10-acceptance-criteria)).
- `canActOn` rank rule: Moderator-on-Moderator/Owner denied; Owner-on-anyone allowed; no self-action.
- Visibility gating: private → `404` for non-member; password metadata visible, join gated.
- Invite-link consumption: expiry, single-use `maxUses`, ban precedence.
- Ownership-transfer selection: nominee → oldest Moderator → oldest Member → teardown/ownerless; deterministic tie-break by `Membership.id` ULID.
- Mute/timeout expiry: lazy evaluation authoritative; timeout auto-lifts at `timeoutUntil`.

### 8.2 Integration (Nest test module + ephemeral Mongo)
- Create → join (public/password/invite) → leave; `(roomId, userId)` uniqueness prevents double membership (`ALREADY_MEMBER`).
- `joinApproval=on`: join → `202` + `JoinRequest`; moderator approve creates membership + emits `room:member:join`; reject denies; pending TTL expiry.
- Moderation: kick allows re-join; ban blocks re-join + invite entry until `DELETE /bans/:userId`; mute suppresses chat send; timeout suppresses interaction until expiry.
- Role management: promote/demote; Moderator cannot set `Owner` or act on Owner.
- Ownership transfer (manual + simulated owner disconnect with grace): atomic single-owner invariant; idempotent under double-trigger; matrix re-derived; events + notification emitted.
- Denormalization: changing owner display name / active video / viewer count reconciles `Room` denorm fields.

### 8.3 End-to-end (web + gateway)
- Two clients: one creates+owns, second joins via invite; `RoomSnapshot` populates membership/playlist/playback/voice on join.
- Owner closes their tab → grace window → automatic transfer to oldest active Moderator; both clients receive `room:ownership:transfer` and re-render affordances.
- Moderator kicks a Member → target's WS room subscription dropped, `room:member:leave {reason:'kicked'}` broadcast.
- Password room: wrong password rejected (`403`), `room-join` sub-bucket throttles repeated attempts.

---

## 9. Documentation Requirements

- Keep [docs/PERMISSIONS.md](../docs/PERMISSIONS.md) authoritative for the matrix, `canActOn`, ownership-transfer, and join-approval; this spec links rather than duplicating diagrams.
- File the R3/R4 ADRs for `room_bans`, `join_requests`, and `room:member:update` (OQ-R1) before implementation; record in `history/decision-ledger.md` and update `context/architecture.md` + `repomix/`.
- Add a **room lifecycle doc** to `docs/` (create → active → ownership-transfer → teardown/archive) cross-referencing [DOMAIN.md §6 State Machines](../docs/DOMAIN.md#6-state-machines).
- Document the `room-join` strict rate sub-bucket and password-hashing policy in [docs/SECURITY.md](../docs/SECURITY.md).
- Update `project-state/` on completion per the per-feature workflow.

---

## 10. Acceptance Criteria (testable, numbered)

- [ ] **AC-1** A verified registered user creates a room and is `Owner`; a guest is refused (`GUEST_FORBIDDEN`); creation is idempotency-keyed. *(FR-1)*
- [ ] **AC-2** Visibility is enforced: a non-member sees `404 ROOM_NOT_FOUND` for a private room; a password room reveals metadata but rejects a missing/wrong password with `ROOM_PASSWORD_REQUIRED`/`403`; the password is stored hashed and never returned. *(FR-2, FR-4)*
- [ ] **AC-3** `PATCH /rooms/:roomId` settings succeeds for Owner only; a Moderator/Member is denied `OWNER_REQUIRED`. *(FR-5)*
- [ ] **AC-4** A `temporary` room is hard-deleted and a `permanent` room is archived (soft-delete, removed from discovery) on `DELETE`. *(FR-6)*
- [ ] **AC-5** Joining honors visibility/password/ban/approval: banned → `BANNED_FROM_ROOM`; `joinApproval=on` → `202 JOIN_PENDING_APPROVAL` creating a `JoinRequest`; registered → `Member`, guest → `Guest`; duplicate membership → `ALREADY_MEMBER`. *(FR-7, FR-10)*
- [ ] **AC-6** Invite links can be created with optional expiry/single-use; consuming an expired/used token returns `INVITE_EXPIRED`; a banned user cannot join via invite. *(FR-9)*
- [ ] **AC-7** Role changes are Owner-only and obey the rank rule; a Moderator cannot act on an equal/higher rank (`CANNOT_ACT_ON_EQUAL_OR_HIGHER`). *(FR-11)*
- [ ] **AC-8** Kick removes membership and allows re-join; ban persists a deny and blocks future joins/invites until unban; mute is indefinite (chat+voice); timeout auto-expires at `timeoutUntil` and blocks all interaction; each broadcasts the correct `room:member:*` event. *(FR-12, FR-13, FR-14)*
- [ ] **AC-9** On owner disconnect/leave the §6 algorithm selects nominee → oldest active Moderator → oldest active Member → (temporary teardown | permanent ownerless); transfer is atomic, idempotent under double-trigger, emits `room:ownership:transfer` + `room.ownership_transfer`, and re-derives every member's permissions. *(FR-15)*
- [ ] **AC-10** An active room always has exactly one Owner (or an explicit `ownerless` state for permanent rooms); never two owners. *(FR-18)*
- [ ] **AC-11** Denormalized `Room` fields (`ownerDisplayName`, `viewerCount`, `currentVideoTitle`) stay consistent with their source aggregates via realtime + reconciliation. *(FR-17)*
- [ ] **AC-12** REST and WS enforce the identical `PermissionService`; every denial uses the canon error envelope / `system:error` with a stable code + propagated `correlationId`; `RoomsModule`+`MembershipsModule` reach ≥ 90% coverage. *(FR-18)*

---

## 11. Open Questions

| # | Question | Recommendation | Process |
|---|---|---|---|
| **OQ-R1** | `room_bans` and `join_requests` are not in canon §4's collection list. | Add both (`(roomId, userId)` unique / partial-unique-pending) — they are the canon-correct shape for durable, independently-queried records. | **ADR + history + context + repomix (R3/R4)** before code. |
| **OQ-R2** | Does `chatLock=on` suppress Member chat or only Guest? | Suppress **both** Guest and Member (Discord "lock" semantics); Owner/Mod still speak. | Confirm with Chief Architect; reflect here + [chat.spec.md](./chat.spec.md). |
| **OQ-R3** | Is `playlistAuthority` a first-class field separate from `playlistLock`? | **Yes** — mirror `SyncAuthority`, configured independently. | Reflect in Prisma `settings`. |
| **OQ-R4** | Room capacity (`ROOM_FULL`) limit — fixed or per-plan? | Fixed default (e.g. 100) for v1; make a room setting later. | Confirm with Product. |
| **OQ-R5** | Should a `room-join` strict rate sub-bucket throttle password brute force? | **Yes**, per-IP + per-room. | Confirm limits with DevOps ([API.md OQ-7](../docs/API.md#5-open-questions)). |

---

### Related documents

- [Architecture Canon](../context/architecture.md) — single source of truth
- [docs/PERMISSIONS.md](../docs/PERMISSIONS.md) — role matrix, `canActOn`, ownership transfer, join approval
- [docs/API.md §3.5–3.6](../docs/API.md#35-rooms) — REST room/membership catalog
- [docs/EVENTS.md §5.3](../docs/EVENTS.md#53-rooms-room) — `room` realtime events
- [docs/DOMAIN.md](../docs/DOMAIN.md) · [docs/DATABASE.md](../docs/DATABASE.md) — entities + schema + state machines
- Sibling specs: [auth.spec.md](./auth.spec.md) · [sync.spec.md](./sync.spec.md) · [chat.spec.md](./chat.spec.md)
</content>
