# Notifications Feature Specification

> One-line purpose: The R5 specification for Cowatch's notification system — the seven canonical notification types, the persist-once / fan-across-channels delivery model, the suppression chain (block → preference → mute → dedup → self-exclusion), per-type/per-channel preferences and DND, read/seen lifecycle, and the activity feed boundary — defining exactly what must be built, tested, and accepted before any code is written.

- **Status:** Draft (Planning, Phase 6 — Notifications) — code-blocked until this spec + tasks + tests + docs exist (R5)
- **Owner agent:** Social / Voice Engineer
- **Last updated: 2026-06-27**

**Canon & cross-links**

- [Architecture Canon](../context/architecture.md) — single source of truth ([§1 Glossary (Notification types)](../context/architecture.md#1-glossary-of-core-domain-terms), [§3 Naming](../context/architecture.md#3-naming-conventions), [§4 Data Modeling](../context/architecture.md#4-data-modeling-conventions-mongodb--prisma), [§5 Realtime](../context/architecture.md#5-realtime-transport-abstraction-adr-004), [§6 Permissions](../context/architecture.md#6-permission-model), [§10 Non-Negotiables](../context/architecture.md#10-cross-cutting-non-negotiables))
- Design docs: [Social System Architecture §6 Notifications](../docs/SOCIAL.md#6-notification-taxonomy), [§4 Activity Feed](../docs/SOCIAL.md#4-activity-feed), [§7 Blocks](../docs/SOCIAL.md#7-blocked-users-semantics), [§8 Privacy](../docs/SOCIAL.md#8-user-profiles--privacy-settings) · [Events §5.9 notification](../docs/EVENTS.md#59-notifications-notification--sc-only) · [Domain Model](../docs/DOMAIN.md) · [Permissions §6 ownership transfer](../docs/PERMISSIONS.md#6-ownership-transfer-algorithm)
- ADRs: [ADR-003 Prisma/MongoDB](../adr/ADR-003-prisma.md) · [ADR-004 Realtime abstraction](../adr/ADR-004-realtime.md) · [ADR-006 Electron desktop](../adr/ADR-006-electron.md) (OS push) · [ADR-008 Auth tokens](../adr/ADR-008-auth.md)
- Sibling specs: [friends.spec.md](./friends.spec.md) · [discovery.spec.md](./discovery.spec.md) · [voice.spec.md](./voice.spec.md)
- Implementation tasks (planned): [tasks/notifications.md](../tasks/notifications.md)

> **Conflict rule.** The seven notification types are **fixed by [canon §1](../context/architecture.md#1-glossary-of-core-domain-terms)**; adding/removing a type requires an ADR (R3). On any discrepancy this spec yields to canon and [Social §6](../docs/SOCIAL.md#6-notification-taxonomy).

Owning NestJS module: **`NotificationsModule`** (`apps/server/src/modules/notifications/`). It exposes a **builder** that every other module calls; it never reaches into another domain to fabricate events. Canonical types in `packages/types`; Prisma model `notifications` (canon §3) in `packages/database`. Desktop OS push rides the Electron IPC bridge (ADR-006).

---

## 1. Overview & User Value

Notifications are the **actionable-alert read model** that pulls users back into Cowatch: a friend came online, a friend started a room, someone invited you, you were mentioned, you got a DM, a room you're in changed owner, or someone joined a room you moderate. A notification is distinct from an **activity feed item** (awareness; [§ Activity boundary](#26-activity-feed-boundary)) and from a **realtime domain event** (transient): a `Notification` is **persisted once**, carries read/seen state, and is **fanned across delivery channels** (in-app feed, realtime toast, desktop/OS push, email digest) according to the recipient's preferences and presence.

**User value:** timely, non-spammy, privacy-respecting re-engagement. The hard requirements are: **never** notify across a block; honor per-type/per-channel toggles, mutes, and DND; de-duplicate noisy events; and keep the unread badge authoritative in one place.

**Value metric:** notification → click-through → session re-entry rate, balanced against opt-out / mute rate (a proxy for spamminess).

---

## 2. Functional Requirements

### 2.0 Scope (in / out)

**In scope:** the seven canonical notification types and their triggers/payloads (§2.1–§2.2); persist-once + multi-channel fan-out (in-app feed, realtime `notification:new` toast, Electron OS push, email digest) (§2.3); the suppression chain — block → type/channel preference → mute → dedup/coalesce → self-exclusion → DND (§2.4); per-type/per-channel preferences, DND/quiet-hours, and mutes (§2.5); the read/seen lifecycle and retention (§2.6); and the **activity feed** read model and its boundary versus notifications (§2.7). The `NotificationsModule` builder is the single producer of `notification:new`.

**Out of scope (owned elsewhere):**

- **The trigger sources themselves** — presence transitions ([Social §3](../docs/SOCIAL.md#3-presence)), room creation/join ([Rooms](./friends.spec.md)), mention parsing ([Chat](../docs/EVENTS.md#56-chat-chat)), DM send ([Social §5](../docs/SOCIAL.md#5-direct-messages)), ownership transfer ([Permissions §6](../docs/PERMISSIONS.md#6-ownership-transfer-algorithm)). This spec *consumes* their calls into the builder; it never fabricates a domain event.
- **The block/privacy predicates** — defined in [friends.spec.md](./friends.spec.md) + [Social §7/§8](../docs/SOCIAL.md#7-blocked-users-semantics); this spec *applies* the shared `packages/social` helpers.
- **Email transport/provider plumbing** — DevOps/infra concern; this spec specifies *eligibility and content*, not the SMTP layer.
- **Adding/removing a notification type** — fixed by canon §1; an ADR-gated change, not a spec decision.
- **A realtime "activity feed" namespace** — there is none (§2.7, FR-AF-2); deferred unless an ADR adds it.

### 2.1 The seven canonical types (fixed by canon §1)

```ts
type NotificationType =
  | 'friend.online'            // a friend transitioned offline → online
  | 'friend.room_started'      // a friend created/started watching in a room
  | 'friend.invitation'        // someone sent YOU a friend request OR a room invite
  | 'mention'                  // you were @-mentioned in a room or DM message
  | 'dm'                       // you received a direct message
  | 'room.ownership_transfer'  // ownership of a room you're in transferred
  | 'room.user_joined';        // a user joined a room you're in (owner/mod-relevant)
```

- **FR-NT-1** Exactly these seven types exist; the builder rejects any unknown `type` (`UNKNOWN_NOTIFICATION_TYPE`). Adding a type is an ADR-gated change.
- **FR-NT-2** Each type produces a `Notification` with the per-type `actorId` / `roomId` / `payload` contract in the [§2.2 table](#22-per-type-trigger--payload-contract); the payload is a **discriminated union** validated per type.
- **FR-NT-3** `friend.invitation` carries **two sub-shapes** (friend request *vs.* room invite) discriminated inside the payload — one canon type, two UX entry points.

### 2.2 Per-type trigger & payload contract

| Type | Trigger (source event) | `actorId` | `roomId` | Key `payload` | Recipients |
|---|---|---|---|---|---|
| `friend.online` | presence `offline→online` ([Social §3.3](../docs/SOCIAL.md#33-presence-distribution--fan-out-scope)) | the friend | — | `{ status }` | the user's friends (privacy + DND aware) |
| `friend.room_started` | a friend creates/opens a room | the friend | the room | `{ roomName, currentVideoTitle? }` | the friend's friends |
| `friend.invitation` | friend request **or** room invite to recipient | sender | room? (invite) | `{ kind:'friend_request', requestId, message? }` \| `{ kind:'room_invite', inviteLinkId, roomId, roomName }` | the targeted user |
| `mention` | `@user` parsed in `chat:message:new` (room or DM) | message author | room? (room mentions) | `{ messageId, channelKind, channelId, excerpt }` | mentioned user(s) |
| `dm` | a DM message delivered ([Social §5.3](../docs/SOCIAL.md#53-send-flow--delivery)) | sender | — | `{ threadId, messageId, preview }` | recipient |
| `room.ownership_transfer` | transfer commits ([Permissions §6](../docs/PERMISSIONS.md#6-ownership-transfer-algorithm)) | prev owner / system | the room | `{ newOwnerId, previousOwnerId, reason }` | affected room members (esp. new owner) |
| `room.user_joined` | `room:member:join` commits | the joiner | the room | `{ joinerId, role }` | owner + moderators (configurable to all) |

- **FR-NT-4** Trigger sources call `NotificationsService.notify(input)`; the **builder** (not the caller) resolves recipients, applies the suppression chain (§2.4), persists, and fans out.

### 2.3 Persist-once, fan-across-channels

- **FR-DLV-1** A surviving notification is **persisted exactly once** as a `notifications` row (the durable feed / source of truth for read state).
- **FR-DLV-2** It is then fanned across channels per recipient preference + presence:

| Channel | Mechanism | When used |
|---|---|---|
| **In-app feed** | the persisted row, read via `GET /me/notifications` | always (unless type fully off) |
| **Realtime toast** | `notification:new` envelope to live sessions ([Events §5.9](../docs/EVENTS.md#59-notifications-notification--sc-only)) | ≥ 1 live WS connection AND not DND-suppressed |
| **Desktop / OS push** | Electron push via IPC (ADR-006) | recipient on desktop app, backgrounded; per-type opt-in |
| **Email digest** | batched email for high-value missed alerts | offline > threshold; opt-in; **never** for `friend.online`/`room.user_joined` |

- **FR-DLV-3** `notification:new` (S→C only) is the **single** canonical realtime delivery event (canon §3); its `data` is the full `Notification` projection with the actor `UserCard` resolved.
- **FR-DLV-4** Read-state acknowledgement happens over **REST**, never realtime, to keep one authoritative writer ([Events OQ-4](../docs/EVENTS.md#11-open-questions)).

### 2.4 Suppression, dedup & throttling (applied **before** persist)

The builder runs a deterministic chain; if any step suppresses fully, **no row is written**:

- **FR-SUP-1 (Block)** Never notify a recipient about an `actorId` they have blocked, nor notify a blocked user about the blocker — symmetric, via the shared `isBlockedBetween` predicate ([Social §7](../docs/SOCIAL.md#7-blocked-users-semantics)).
- **FR-SUP-2 (Type/channel preference)** If the recipient disabled the `type`, suppress entirely (no row); if they disabled only a *channel* for the type, skip that channel but still write the feed row.
- **FR-SUP-3 (Mute scope)** Muted room ⇒ suppress `room.user_joined`/`mention` from it; muted DM thread ⇒ suppress `dm` from it.
- **FR-SUP-4 (Dedup window)** Collapse repeats: a second `friend.online` for the same friend within `NOTIF_ONLINE_DEDUP_WINDOW` (default 30 min) is dropped; rapid `room.user_joined` coalesce into a count ("3 people joined").
- **FR-SUP-5 (Self-exclusion)** Never notify the actor about their own action.
- **FR-SUP-6 (DND)** `dnd` presence or active quiet-hours (`dndUntil`) suppresses **toast + push** but still writes the feed row and may still email per type. **Invisible** does NOT affect inbound notifications.

### 2.5 Preferences, DND & mutes

```ts
interface NotificationPrefs {
  perType: Record<NotificationType, { inApp: boolean; toast: boolean; push: boolean; email: boolean }>;
  dndUntil: string | null;       // quiet-hours / DND expiry (ISO-8601 UTC)
  mutedRoomIds: string[];        // bounded embed for v1 (see OQ-N1)
  mutedThreadIds: string[];
}
```

- **FR-PREF-1** Preferences are an embedded VO on `User` ([Social §8.1](../docs/SOCIAL.md#81-profile-model)), updated via `PATCH /api/v1/me/privacy` (validated discriminated DTO).
- **FR-PREF-2** Sensible defaults (per [Social OQ-5](../docs/SOCIAL.md#10-open-questions)): `friend.online`/`room.user_joined` → in-app + toast only (never email); `friend.invitation`/`mention`/`dm`/`room.ownership_transfer` → in-app + toast + push, and email when offline > threshold.
- **FR-PREF-3** Mutes (`mutedRoomIds`/`mutedThreadIds`) are bounded embedded lists for v1; if a power user exceeds the bound, the operation returns `TOO_MANY_MUTES` and the field migrates to a referenced collection via R3/R4 ([OQ-N1](#7-open-questions)).
- **FR-PREF-4** **Guests** get the most restrictive defaults and cannot relax DM/friend-request-driven notifications (canon §8); they have no email channel.

### 2.6 Read / seen lifecycle

- **FR-LC-1** Lifecycle: `created → seen (badge cleared) → read (acknowledged)`. Invariant **`readAt ⇒ seenAt`** (marking read implies seen).
- **FR-LC-2** Unread = `readAt === null`; the badge count is served by the `(userId, readAt, createdAt)` index (canon §4).
- **FR-LC-3** Endpoints: mark one read, mark all read, mark surfaced/seen (clear badge without "opening").
- **FR-LC-4** **Retention:** read notifications older than 90 days are swept; unread retained longer (180 days) to avoid losing actionable items.

### 2.7 Activity feed boundary

> The **activity feed** (`ActivityEvent`, awareness, append-only, no read state) is a **distinct** read model from notifications ([Social §4](../docs/SOCIAL.md#4-activity-feed)). It is *summarized here for boundary clarity* and owned by the same `SocialModule`/`NotificationsModule` seam; the `activity_events` collection requires the R3/R4 process ([Social OQ-1](../docs/SOCIAL.md#10-open-questions)).

- **FR-AF-1** `ActivityEvent`s are generated **fan-out-on-write** (one row per recipient), block- and privacy-filtered at **both** write (audience) and read time.
- **FR-AF-2** The feed is read via `GET /api/v1/me/activity` (cursor over `(userId, createdAt)`); no realtime "feed event" namespace — items surface on next fetch or piggyback on `social:*` / `room:member:join` the client already subscribes to.
- **FR-AF-3** Feed retention is a rolling window (90 days or last 500 per user); noisy types (`friend.online`, `media.added`) are coalesced per `ACTIVITY_ONLINE_COALESCE_WINDOW` (1 h).

---

## 3. Data Model Touchpoints

> Prisma owns the persisted shape (ADR-003); types below are illustrative and match [Social §6.1](../docs/SOCIAL.md#61-the-seven-canonical-types). Ids are strings (canon §4).

### 3.1 `notifications` collection

```ts
interface Notification {
  id: string;
  userId: string;              // RECIPIENT (FK, indexed)
  type: NotificationType;
  actorId: string | null;      // who triggered it (denorm card resolved at read)
  roomId: string | null;
  payload: NotificationPayload;// discriminated by `type`, validated per type
  seenAt: string | null;       // surfaced in feed (badge cleared)
  readAt: string | null;       // opened/acknowledged (readAt ⇒ seenAt)
  createdAt: string;
  updatedAt: string;
}
```

### 3.2 `activity_events` collection (R3/R4-gated — see OQ-N2)

```ts
type ActivityEventType =
  | 'friend.added' | 'friend.online' | 'room.created'
  | 'room.joined'  | 'room.left'     | 'media.added' | 'media.skipped';

interface ActivityEvent {
  id: string;
  userId: string;          // feed OWNER (recipient of the awareness item)
  type: ActivityEventType;
  actorId: string | null;
  subjectId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;       // append-only; no soft delete
}
```

### 3.3 Indexes (canon §4)

| Collection | Index | Purpose |
|---|---|---|
| `notifications` | `(userId, readAt, createdAt)` | **mandatory (canon §4)** — "my unread, newest first" + badge count |
| `notifications` | `(userId, type, createdAt)` | per-type filtering + dedup-window scans |
| `notifications` | `(createdAt)` | retention sweep |
| `activity_events` | `(userId, createdAt)` | reverse-chronological feed read (cursor) |
| `activity_events` | `(createdAt)` | retention sweep |

- **Timestamps:** `createdAt @default(now())` + `updatedAt @updatedAt` (canon §4).
- **Denormalization:** `Notification.payload` actor/room display fields and the actor `UserCard` are **resolved at read** from `User.profile` / `Room` ([Social §9](../docs/SOCIAL.md#9-denormalization--fan-out)); not persisted stale onto the row.
- **Separation invariant:** `Notification` (read state, retention 90/180d) and `ActivityEvent` (no read state, retention 90d/500) are **never** merged into one collection.

---

## 4. API & Event Surface

### 4.1 REST (canon §3)

| Method & path | Purpose | Success | Errors |
|---|---|---|---|
| `GET /api/v1/me/notifications?filter=unread\|all&cursor=&limit=` | Paginated feed | `{ data: NotificationView[], meta }` | `VALIDATION_FAILED` |
| `GET /api/v1/me/notifications/unread-count` | Badge count | `{ count }` | — |
| `POST /api/v1/me/notifications/:id/read` | Mark one read (`readAt`, implies `seenAt`) | `200 NotificationView` | `NOTIFICATION_NOT_FOUND`, `NOT_NOTIFICATION_RECIPIENT` |
| `POST /api/v1/me/notifications/read-all` | Mark all read | `204` | — |
| `POST /api/v1/me/notifications/seen` | Mark surfaced (clear badge, not "opened") | `204` | — |
| `PATCH /api/v1/me/privacy` | Update `NotificationPrefs` + DND + mutes | `200` | `VALIDATION_FAILED`, `TOO_MANY_MUTES` |
| `GET /api/v1/me/activity?cursor=&limit=` | Activity feed page (block/privacy filtered) | `{ data: ActivityEventView[], meta }` | — |
| `DELETE /api/v1/me/activity` | Clear caller's feed (no effect on others) | `204` | — |

All inputs validated via `class-validator` DTOs; non-2xx use the [standard error envelope](../context/architecture.md#10-cross-cutting-non-negotiables) with stable SCREAMING_SNAKE `code` + `correlationId`.

### 4.2 Realtime (canon §3 — `notification` namespace, **S→C only**)

| Event | Direction | Ack | Payload (`data`) | Notes |
|---|---|---|---|---|
| `notification:new` | **S→C only** | n/a | `NotificationEvent` | One per surviving notification, delivered to the recipient self-topic (`user:<id>`). Clients never *emit* notifications. |

```ts
export interface NotificationEvent {
  notificationId: string;
  type: NotificationType;
  actorId: string | null;
  actorDisplayName: string | null;   // denorm resolved at emit
  targetRoomId?: string;
  targetThreadId?: string;
  targetMessageId?: string;
  createdAt: number;                  // epoch ms (UTC)
  readAt: number | null;             // null when freshly pushed
}
```

- **Internal source events** (NOT new namespaces): the builder is *triggered* by existing domain events/calls — `presence:update` (online transition), room creation, `chat:message:new` (mention), DM send, `room:ownership:transfer`, `room:member:join`. The builder is the single producer of `notification:new`.

### 4.3 Error code vocabulary (this feature)

`UNKNOWN_NOTIFICATION_TYPE`, `NOTIFICATION_NOT_FOUND`, `NOT_NOTIFICATION_RECIPIENT`, `TOO_MANY_MUTES`, `VALIDATION_FAILED`.

---

## 5. Permissions / Privacy

| Concern | Rule | Enforced at |
|---|---|---|
| **Read-state writes** | only the recipient may mark their own notifications read/seen | `:id/read`, `read-all`, `seen` guards |
| **Cross-block delivery** | no notification whose `actorId`/recipient pair crosses a block (symmetric) | builder step 1 (FR-SUP-1) |
| **Type/channel opt-out** | recipient's `perType` toggles + DND + mutes | builder steps 2/3/6 |
| **Email eligibility** | only high-value types, only when offline > threshold; never `friend.online`/`room.user_joined` | channel selection (FR-PREF-2) |
| **Guest restriction** | restrictive defaults; no email; cannot relax | preference resolution (FR-PREF-4) |
| **Activity visibility** | `showActivityToFriends` gates fan-out; block + privacy filtered at write **and** read | activity audience + read (FR-AF-1) |
| **Projection safety** | deliver `NotificationView`/`NotificationEvent` projections, never raw cross-user `User` | every read/emit |

A `Block` **always overrides** an "allow" preference (hard deny precedes refinement). All gates are shared `packages/social` predicates (canon §3, DRY) so notifications, presence, DM, and search apply identical policy.

---

## 6. Implementation Tasks

> Seeds [tasks/notifications.md](../tasks/notifications.md). No app code until tasks + tests exist (R5).

1. **T-NT-Schema** — Add `notifications` model (+ `(userId, readAt, createdAt)` mandatory index, plus §3.3) and, gated by [OQ-N2](#7-open-questions), `activity_events`. *(FR-NT, FR-AF, §3)*
2. **T-NT-Types** — `NotificationType`, `Notification`, discriminated `NotificationPayload` (per-type), `NotificationEvent`, `NotificationView`, `NotificationPrefs`, `ActivityEvent` in `packages/types`. *(FR-NT-2/3, FR-PREF-1)*
3. **T-NT-Builder** — `NotificationsService.notify(input)` implementing the suppression chain (block → type/channel pref → mute → dedup/coalesce → self-exclusion → DND) **before** persist; persist-once. *(FR-NT-4, FR-SUP-1..6, FR-DLV-1)*
4. **T-NT-Fanout** — Channel fan-out: write feed row, emit `notification:new` to live sessions, enqueue OS push (Electron IPC), enqueue email digest by eligibility. *(FR-DLV-2/3)*
5. **T-NT-Triggers** — Wire the seven trigger sources to the builder (presence online, room created, mention parse in chat, DM send, ownership transfer, member join, friend/room invitation) — callers pass intent, builder owns policy. *(§2.2)*
6. **T-NT-Dedup** — Implement dedup window for `friend.online` and coalescing for `room.user_joined` (count rollup). *(FR-SUP-4)*
7. **T-NT-Lifecycle** — Read/seen endpoints + `readAt ⇒ seenAt` invariant + unread-count via index. *(FR-LC-1..3)*
8. **T-NT-Prefs** — `PATCH /me/privacy` for `NotificationPrefs`/DND/mutes with `TOO_MANY_MUTES` bound + guest defaults. *(FR-PREF-1..4)*
9. **T-NT-Retention** — Sweep jobs: notifications (90d read / 180d unread) and activity feed (90d / 500). *(FR-LC-4, FR-AF-3)*
10. **T-NT-Activity** — Activity feed write (fan-out-on-write, audience resolution) + read endpoint + clear; block/privacy filter at both ends. *(FR-AF-1..3)*
11. **T-NT-DesktopPush** — Electron OS-push channel over IPC (ADR-006); web Notifications where granted. *(FR-DLV-2)*
12. **T-NT-Tests** — Unit + integration + e2e per [§ Test Plan](#-test-plan) to ≥ 90%.
13. **T-NT-Docs** — Update [docs/SOCIAL.md](../docs/SOCIAL.md) §6/§4, [docs/EVENTS.md](../docs/EVENTS.md) §5.9, [docs/API.md](../docs/API.md); author [docs/NOTIFICATIONS.md](../docs/NOTIFICATIONS.md); then history + context + repomix + project-state.

---

## Test Plan

Coverage target **90%** (canon §10). Layers: unit (builder/suppression/lifecycle), integration (Prisma + index behavior), e2e (REST + WS), and channel-fanout.

### Unit

- **Suppression chain order:** for each type, assert block → type/channel pref → mute → dedup → self-exclusion → DND, and that full suppression writes **no** row while channel-only suppression still writes the feed row.
- **Per-type contract:** each of the seven types yields the correct `actorId`/`roomId`/`payload` discriminant; `friend.invitation` resolves both sub-shapes.
- **Lifecycle invariant:** `readAt` set ⇒ `seenAt` non-null; unread filter excludes read rows.
- **Dedup/coalesce:** second `friend.online` within window dropped; N `room.user_joined` collapse to a count.
- **Email eligibility:** `friend.online`/`room.user_joined` never email; high-value types email only when offline > threshold.

### Integration (DB-backed)

- **Badge count** is correct and served via `(userId, readAt, createdAt)`; mark-all-read zeroes it.
- **Retention sweep** removes read > 90d, keeps unread to 180d; activity sweep enforces 90d/500.
- **Mutes bound:** exceeding the embedded mute cap returns `TOO_MANY_MUTES`.
- **Activity dual-filter:** an event written before a later block is excluded at read time (defense-in-depth).

### e2e (REST + realtime)

- Trigger each source → recipient receives one `notification:new` on their self-topic with the correct projection; blocked actor produces **no** event and **no** row.
- DND suppresses toast + push but the feed row + `GET /me/notifications` still reflect it.
- Read-state changes are REST-driven and reflected in `unread-count`; no realtime read events exist.
- Error envelope conformance for `NOTIFICATION_NOT_FOUND` / `NOT_NOTIFICATION_RECIPIENT`.

### Channel / desktop

- Electron OS push fires only for desktop, backgrounded, per-type opt-in; absent on web/foreground.
- Email digest batches missed high-value alerts after the offline threshold; idempotent (no double-send).

---

## Acceptance Criteria

Testable and numbered; the feature is **done** when all pass at ≥ 90% coverage.

1. **AC-NT-1 (Taxonomy completeness)** All seven canon types are produced with the correct `actorId`/`roomId`/`payload` per [§2.2](#22-per-type-trigger--payload-contract); unknown types are rejected (`UNKNOWN_NOTIFICATION_TYPE`); `friend.invitation` serves both friend-request and room-invite sub-shapes. *(FR-NT-1..4)*
2. **AC-NT-2 (Persist-once)** Each surviving notification creates exactly one `notifications` row; the row is the authoritative read-state record. *(FR-DLV-1)*
3. **AC-NT-3 (Multi-channel fan)** A persisted notification is delivered to in-app feed always, realtime toast when live + not DND, OS push when desktop-backgrounded + opted-in, email only for eligible high-value offline cases — per preferences. *(FR-DLV-2/3, FR-PREF-2)*
4. **AC-NT-4 (Suppression chain)** The chain (block → type/channel pref → mute → dedup → self-exclusion → DND) is applied **before** persist; full suppression writes no row, channel suppression still writes the feed row, self-actions never notify the actor. *(FR-SUP-1..6)*
5. **AC-NT-5 (Block universality)** No notification ever crosses a block in either direction; block existence is never revealed via notification presence/absence. *(FR-SUP-1)*
6. **AC-NT-6 (Dedup/coalesce)** Repeated `friend.online` within the window is dropped; bursts of `room.user_joined` coalesce into a count. *(FR-SUP-4)*
7. **AC-NT-7 (Lifecycle)** `readAt ⇒ seenAt`; mark-one/all-read and seen behave per [§2.6](#26-read--seen-lifecycle); unread badge served by the canon index; read-state writes are REST-only. *(FR-LC-1..3, FR-DLV-4)*
8. **AC-NT-8 (Retention)** Read notifications swept at 90d, unread kept to 180d; activity feed bounded to 90d/500. *(FR-LC-4, FR-AF-3)*
9. **AC-NT-9 (Preferences + guest)** Per-type/per-channel toggles, DND/quiet-hours, and mutes are honored; guests get restrictive defaults with no email and cannot relax them; exceeding the mute bound returns `TOO_MANY_MUTES`. *(FR-PREF-1..4)*
10. **AC-NT-10 (Realtime contract)** `notification:new` is S→C only, a valid `RealtimeEnvelope` (`v:1`, ULID `id`), delivered to the recipient self-topic with a safe projection; clients cannot emit it. *(FR-DLV-3)*
11. **AC-NT-11 (Activity separation)** `ActivityEvent` and `Notification` are distinct collections with distinct retention and no read-state bleed; the feed is block/privacy filtered at write and read; no realtime feed namespace exists. *(FR-AF-1..3)*
12. **AC-NT-12 (Observability)** Every notification carries one ULID `correlationId` traceable across source event → builder → persist → fan-out channels → logs; all errors use the canon envelope/codes; coverage ≥ 90%. *(canon §10)*

---

## 7. Open Questions

| # | Question | Recommendation | Process |
|---|---|---|---|
| **OQ-N1** | `mutedRoomIds`/`mutedThreadIds` embedded vs. referenced (canon §4 unbounded rule). | **Embed (bounded) for v1**; enforce a cap (`TOO_MANY_MUTES`); migrate to a `notification_mutes` referenced collection if power users exceed it. Mirrors [Social OQ-3](../docs/SOCIAL.md#10-open-questions). | ADR + R3/R4 on migration. |
| **OQ-N2** | `activity_events` collection is not in canon §4's list. | **Add it** (append-only, `(userId, createdAt)` index, retention-swept) — required for the awareness feed. Mirrors [Social OQ-1](../docs/SOCIAL.md#10-open-questions). | ADR + history + context + repomix (R3/R4) **before** implementing the feed. |
| **OQ-N3** | Email digest cadence + offline threshold values. | Start: digest every 6 h, offline threshold 30 min, only high-value types; tune with open/complaint metrics. | Set constants in tasks; revisit post-launch. |
| **OQ-N4** | Should `room.user_joined` default to owner+mods only or all members? | **Owner + moderators by default**, room-configurable to all (high volume otherwise). Mirrors [Social §6.2](../docs/SOCIAL.md#62-per-type-contract). | Confirm with Rooms/Permissions owners. |
| **OQ-N5** | Cross-device read-state sync without realtime read events. | **Acceptable for v1** (REST is the single writer; clients reconcile on fetch/resume). Confirm desktop offline-sync needs. Mirrors [Events OQ-4](../docs/EVENTS.md#11-open-questions). | Confirm with Notifications + Electron. |

> OQ-N1 and OQ-N2 extend the canonical data model and therefore require the R3/R4 process (ADR + history + context + repomix) before implementation — they are **not** silently assumed.

---

## 8. Documentation Requirements

- **Spec → docs:** on implementation, update [docs/SOCIAL.md](../docs/SOCIAL.md) §6/§4, the [docs/EVENTS.md §5.9](../docs/EVENTS.md#59-notifications-notification--sc-only) row, and the [docs/API.md](../docs/API.md) notification routes/errors; author a user-facing [docs/NOTIFICATIONS.md](../docs/NOTIFICATIONS.md) (types, channels, DND/mute behavior).
- **Types:** all notification types/DTOs land in `packages/types`; shared suppression predicates in `packages/social` — never duplicated (canon §3).
- **Process (R3/R4/R5):** spec (this file) → [tasks/notifications.md](../tasks/notifications.md) → tests → docs → ADR (required for `activity_events` and any mute-collection migration) → implement → test → history → context → repomix → project-state.

---

*This specification is downstream of and bound by the [Cowatch Architecture Canon](../context/architecture.md) and the [Social System Architecture](../docs/SOCIAL.md). The notification type set is fixed by canon §1; any new type, new delivery channel, or the `activity_events` collection requires an ADR + history entry + context update + repomix update (canon §10, R3/R4).*
