# Database Design & Prisma Schema

> The canonical schema-in-design for Cowatch: the MongoDB + Prisma modeling philosophy, the full `schema.prisma` materialization of the domain model, per-collection embed-vs-reference tradeoffs, the indexing strategy, and the data-retention / TTL policy.

**Status:** Draft (Planning — Phase 0: Architecture)
**Owner agent:** Backend Engineer
**Last updated: 2026-06-27**

> Amended 2026-06-27: Added `room_bans` + `join_requests` models (B3), confirmed `activity_events`/`role_assignments`/`votes` (B3/B4), added `playlistAuthority` to `RoomSettings` (B6, renamed from `syncAuthorityPlaylist`), and resolved DB Open Questions per the Chief Architect's RESOLUTIONS.

> Canon compliance: this document implements [ADR-003 — Prisma over MongoDB](../adr/ADR-003-prisma-mongodb.md) and conforms to [Architecture Canon §4 — Data-Modeling Conventions](../context/architecture.md#4-data-modeling-conventions-mongodb--prisma), [§3 — Naming Conventions](../context/architecture.md#3-naming-conventions), and [§10 — Cross-Cutting Non-Negotiables](../context/architecture.md#10-cross-cutting-non-negotiables). The schema below is the **authoritative persisted shape** of the [Domain Model](./DOMAIN.md). Collection names, type names, enum members, and id strategy match the canon verbatim.

---

## 0. Scope & Authority

This document is the bridge between the [Domain Model](./DOMAIN.md) (aggregates, invariants, lifecycles) and the concrete persistence layer. It owns the **schema-in-design**: a complete, review-ready `schema.prisma` that the implementation phase will copy into `packages/database/prisma/schema.prisma` and generate a typed client from. It is a **planning artifact** — it defines shape, indexes, and storage policy; it is not a generated client and ships no runtime code.

Authority order on conflict:

1. [Architecture Canon](../context/architecture.md) — wins on everything.
2. [Domain Model](./DOMAIN.md) — wins on aggregate shape, invariants, and lifecycle.
3. **This document** — wins on concrete field types, Prisma attributes, indexes, and storage policy.
4. Downstream specs/tasks/tests — must comply with all of the above.

Related documents:

- [Architecture Canon](../context/architecture.md) — single source of truth.
- [Domain Model](./DOMAIN.md) — aggregates, invariants, state machines (direct upstream of this schema).
- [ADR-003 — Prisma over MongoDB](../adr/ADR-003-prisma-mongodb.md) — the embed/reference decision.
- [AUTH design](./AUTH.md) — Session / refresh-token-family semantics (canon §8).
- [Permissions design](./PERMISSIONS.md) — `RoomRole`, `SyncAuthority`, moderation state.
- [Sync design](./SYNC.md) — `PlaybackState` value object (canon §7).
- `packages/types` — TypeScript domain + DTO + event types (the type SOURCE OF TRUTH; this schema MUST stay shape-compatible with it).

> Cross-links use the [doc cross-link convention](../context/architecture.md#9-directory--path-map--doc-cross-links). Some targets are authored in later phases.

---

## 1. MongoDB + Prisma Modeling Philosophy

Cowatch persists to **MongoDB** through **Prisma** (ADR-003). This is a deliberate pairing of a document database with a typed, migration-aware client. The modeling discipline below is non-negotiable; it is what keeps a NoSQL store from degrading into a poorly-indexed relational schema.

### 1.1 Think in documents, not joins

MongoDB has no server-side joins in our hot paths. We **never** design a read that requires fanning across three collections to render one view. Instead:

- **Shape collections around read patterns**, not around third-normal-form purity. The unit of storage is the *document a screen needs*, not the smallest non-redundant fact.
- **Denormalize read-hot, slowly-changing fields** so the common render is a single indexed lookup (canon §4). A room card in Discovery reads `Room` alone — `currentVideoTitle`, `viewerCount`, `ownerDisplayName` all live on the document.
- **Accept controlled redundancy** as the cost of avoiding fan-out. Redundant fields are *eventually consistent*; the owning aggregate is the source of truth and re-fans changes via realtime + background reconciliation (see [§5 Denormalization Register](#5-denormalization--source-of-truth-register) and [DOMAIN §7](./DOMAIN.md#7-denormalization-source-of-truth-register)).

### 1.2 Embed vs. reference — the decision rule

Per [canon §4](../context/architecture.md#4-data-modeling-conventions-mongodb--prisma), we apply one rule per child relationship:

| Embed (composite type) when… | Reference (separate collection + id) when… |
|---|---|
| Child is **owned** by exactly one parent | Child is **shared** or independently owned |
| Child is **bounded** (fixed or capped cardinality) | Child is **unbounded** / grows over time |
| Child is **always read with** the parent | Child is **queried independently** of the parent |
| Child has **no identity** of its own (value object) | Child has a **stable id** queried/sorted/filtered |

**Hard rule (never violated):** an unbounded growing list (`messages`, `queue_items`, `memberships`, `notifications`, `activity_events`, `votes`, `role_assignments`) is **never** embedded. These are always separate collections with a back-reference id + index. Embedding them would create unbounded document growth, blow the 16 MB BSON document cap, and force whole-document rewrites on every append.

Embedded children are modeled in Prisma as **`type` composite types** (Prisma's MongoDB embedded-document construct) — they have no `@id`, no collection, and no `@@map`. They are written and read atomically with their parent root.

### 1.3 Avoid relational thinking — concrete anti-patterns we reject

- **No junction/through tables for the sake of normalization.** `Membership` is *not* a pure join row: it is a first-class aggregate carrying role, moderation state, and denormalized identity, because the permission model operates on it directly. `DmThread.participantIds` is an embedded id array, not a `thread_participants` join collection.
- **No multi-collection transactions on the read path.** Cross-aggregate consistency is eventual by design. We use MongoDB transactions only for the few **intra-operation atomic swaps** the domain demands (ownership transfer, refresh-token rotation, skip-vote commit) — never as a substitute for good document shape.
- **No `ObjectId` instances crossing the service boundary.** Every id is a **string** in TypeScript. Prisma maps `_id` and all foreign keys to `String @db.ObjectId`; the wire format and the SDK see strings only (canon §4, §10).
- **No relational cascade reliance.** MongoDB does not enforce referential integrity. Deletes are **soft** (`deletedAt`) by default; hard deletes and orphan cleanup are explicit background jobs (see [§7 Retention](#7-data-retention--ttl-policy)). Application services own integrity, not the database.

### 1.4 Prisma-specific conventions

- **Datasource** `mongodb`; **generator** `prisma-client-js`. The schema is the single owner of the data model and lives at `packages/database/prisma/schema.prisma`; the generated client is re-exported through `packages/database` (canon §4, §9).
- **Id strategy (uniform):** `id String @id @default(auto()) @map("_id") @db.ObjectId`. Every foreign key is `String @db.ObjectId`.
- **Collection mapping:** every model carries `@@map("snake_case_plural")` to enforce the [canonical collection names](../context/architecture.md#3-naming-conventions). Field names stay `camelCase` in TS; only collection names are `snake_case`.
- **Timestamps:** every collection has `createdAt DateTime @default(now())` and `updatedAt DateTime @updatedAt`. Append-only collections (`role_assignments`, `activity_events`) omit `updatedAt` by design.
- **Soft delete:** mutable aggregates carry `deletedAt DateTime?`; every query filters it. Append-only streams do not soft-delete.
- **Relations vs. raw ids:** Prisma on MongoDB supports `@relation` back-references. We declare relations where they aid type-safety and the related cardinality is bounded enough to be useful, but we treat all cross-aggregate links as **id references** semantically (a `@relation` is a convenience, never a transactional guarantee). We deliberately keep some links as **bare `@db.ObjectId` ids without a `@relation`** where the target is polymorphic (`Message.channelId` → room *or* dm thread) or where a back-relation would invite accidental fan-out.

---

## 2. Collection Inventory

The schema materializes exactly the [DOMAIN aggregate map](./DOMAIN.md#2-aggregate-map). Embedded value objects become Prisma `type`s; everything else is a collection.

| Domain aggregate / VO | Prisma construct | Collection (`@@map`) | Kind |
|---|---|---|---|
| `User` | model `User` | `users` | collection |
| `UserProfile` | type `UserProfile` | — | embedded |
| `PresenceSnapshot` | type `PresenceSnapshot` | — | embedded |
| `Session` | model `Session` | `sessions` | collection |
| `DeviceMetadata` | type `DeviceMetadata` | — | embedded |
| `RefreshTokenFamily` | type `RefreshTokenFamily` | — | embedded |
| `Friendship` | model `Friendship` | `friendships` | collection |
| `FriendRequest` | model `FriendRequest` | `friend_requests` | collection |
| `Block` | model `Block` | `blocks` | collection |
| `Room` | model `Room` | `rooms` | collection |
| `RoomSettings` | type `RoomSettings` | — | embedded |
| `PlaybackState` | type `PlaybackState` | — | embedded |
| `Membership` | model `Membership` | `memberships` | collection |
| `ModerationState` | type `ModerationState` | — | embedded |
| `RoomBan` | model `RoomBan` | `room_bans` | collection |
| `JoinRequest` | model `JoinRequest` | `join_requests` | collection |
| `RoleAssignment` | model `RoleAssignment` | `role_assignments` | collection (append-only) |
| `Playlist` | model `Playlist` | `playlists` | collection |
| `QueueItem` | model `QueueItem` | `queue_items` | collection |
| `VoteTally` | type `VoteTally` | — | embedded |
| `Vote` | model `Vote` | `votes` | collection |
| `Message` | model `Message` | `messages` | collection |
| `Reaction` | type `Reaction` | — | embedded (capped) |
| `Attachment` | type `Attachment` | — | embedded (capped) |
| `Mention` | type `Mention` | — | embedded |
| `DmThread` | model `DmThread` | `dm_threads` | collection |
| `Notification` | model `Notification` | `notifications` | collection |
| `ActivityEvent` | model `ActivityEvent` | `activity_events` | collection (append-only) |
| `VoiceChannel` | model `VoiceChannel` | `voice_channels` | collection |
| `InviteLink` | model `InviteLink` | `invite_links` | collection |

> The canon names 14 collections explicitly; this schema adds `role_assignments`, `votes`, `activity_events`, and (per the 2026-06-27 RESOLUTIONS B3) `room_bans` + `join_requests` per the [DOMAIN aggregate map](./DOMAIN.md#2-aggregate-map). Adding a collection is a data-model change → it travels with this document's history/context update (R3/R4), not an ADR (no architecture decision changes).
>
> **Amended 2026-06-27 (B3):** `room_bans` (durable bans that outlive membership deletion) and `join_requests` (pending join-approval queue) are added as first-class collections; `activity_events` (B3), `role_assignments` (B4), and `votes` (B4) are confirmed present with the canon-mandated indexes. These are added to the [Architecture Canon §3](../context/architecture.md#3-naming-conventions) collection list alongside this change.

---

## 3. Full Prisma Schema (canonical schema-in-design)

> This is the authoritative shape. It is review-ready Prisma for MongoDB. Enum members and type names match the [Domain Model](./DOMAIN.md#3-entity-definitions-illustrative-shape-sketches) and canon verbatim. `@@index` directives encode the [§6 indexing strategy](#6-indexing-strategy).

```prisma
// packages/database/prisma/schema.prisma
// Cowatch persisted data model — SOURCE OF TRUTH for storage shape.
// Implements ADR-003 (Prisma over MongoDB). See docs/DATABASE.md, docs/DOMAIN.md.

datasource db {
  provider = "mongodb"
  url      = env("DATABASE_URL")
}

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["fullTextSearch"] // text-eligible fields use Atlas Search; see §6.4
}

// ============================================================================
// ENUMS
// ============================================================================

enum UserKind {
  registered
  guest
}

enum PresenceStatus {
  online
  idle
  dnd
  offline
}

enum DevicePlatform {
  web
  desktop
}

enum FriendRequestStatus {
  pending
  accepted
  declined
  cancelled
  expired
}

enum RoomVisibility {
  public
  private
  password
}

enum RoomLifecycle {
  temporary
  permanent
}

enum RoomStatus {
  active
  idle
  ownerless
  archived
  teardown_scheduled
}

enum SyncAuthority {
  owner_only
  owner_moderators
  everyone
}

enum RoomRole {
  Owner
  Moderator
  Member
  Guest
}

enum MembershipStatus {
  active
  left
  kicked
  banned
}

enum RoleAssignmentReason {
  manual
  ownership_transfer
  system
}

enum JoinRequestStatus {
  pending
  approved
  rejected
  cancelled
  expired
}

enum MediaProvider {
  youtube
}

enum QueueItemStatus {
  queued
  playing
  played
  skipped
  removed
}

enum VoteKind {
  up
  down
  skip
}

enum ChannelKind {
  room
  dm
}

enum MessageStatus {
  visible
  edited
  deleted
}

enum AttachmentKind {
  gif
  emoji
  image
}

enum NotificationType {
  friend_online          @map("friend.online")
  friend_room_started    @map("friend.room_started")
  friend_invitation      @map("friend.invitation")
  mention                @map("mention")
  dm                     @map("dm")
  room_ownership_transfer @map("room.ownership_transfer")
  room_user_joined       @map("room.user_joined")
}

enum ActivityEventType {
  friend_added   @map("friend.added")
  friend_online  @map("friend.online")
  room_created   @map("room.created")
  room_joined    @map("room.joined")
  room_left      @map("room.left")
  media_added    @map("media.added")
  media_skipped  @map("media.skipped")
}

enum VoiceVisibility {
  public
  password
}

// ============================================================================
// EMBEDDED VALUE OBJECTS (Prisma composite types — no _id, no collection)
// ============================================================================

type UserProfile {
  displayName String
  username    String  // unique handle; uniqueness enforced via User.usernameLower index
  avatarUrl   String? // MinIO object key / signed-URL base (ADR-009)
  bio         String?
  bannerUrl   String?
}

type PresenceSnapshot {
  status       PresenceStatus @default(offline)
  activityKind String?        // 'room' when in a room, else null
  activityRoomId String?      @db.ObjectId
  lastActiveAt DateTime
}

type DeviceMetadata {
  label     String?
  userAgent String
  ipRegion  String?        // coarse geo only; raw IP never stored at rest
  platform  DevicePlatform
}

type RefreshTokenFamily {
  currentTokenHash String    // sha-256 of opaque refresh token
  familyId         String    // ULID; reuse-detection key
  rotatedAt        DateTime
  reuseDetectedAt  DateTime? // set on theft response → family revoked
}

type RoomSettings {
  syncAuthorityPlayback SyncAuthority @default(owner_only)        // gates room:playback:* (playback authority)
  playlistAuthority     SyncAuthority @default(owner_moderators)  // B6: first-class, gates room:playlist:* independently of playback authority
  chatLocked            Boolean       @default(false)             // PERM OQ-1: chatLock=on suppresses BOTH Guest and Member chat; Owner/Mod exempt
  playlistLocked        Boolean       @default(false)             // when on, Members are blocked from room:playlist:* even if playlistAuthority=everyone
  joinApprovalRequired  Boolean       @default(false)             // when on, joins create a JoinRequest (join_requests) instead of an immediate Membership
  nsfw                  Boolean       @default(false)
  tags                  String[]      @default([]) // capped, lowercased (app-enforced)
  maxMembers            Int?
  ownerGraceWindowMs    Int           @default(30000) // canon §6 default
}

type PlaybackState {
  itemId        String?       @db.ObjectId // current QueueItem id, null if empty
  positionMs    Int           @default(0)
  isPlaying     Boolean       @default(false)
  rate          Float         @default(1.0)
  serverEpochMs Float         @default(0) // server stamp; epoch ms (canon §7)
  authority     SyncAuthority @default(owner_only) // mirror of settings.syncAuthorityPlayback
}

type ModerationState {
  mutedUntil   DateTime?
  timeoutUntil DateTime?
  banReason    String?
}

type VoteTally {
  up   Int @default(0) // denorm ← count(Vote kind=up)
  down Int @default(0) // denorm ← count(Vote kind=down)
  skip Int @default(0) // denorm ← count(Vote kind=skip)
}

type Reaction {
  emoji   String
  userIds String[] // capped; count derived from length (unbounded growth forbidden)
}

type Attachment {
  kind   AttachmentKind
  url    String // MinIO object key or provider URL
  width  Int?
  height Int?
}

type Mention {
  userId String @db.ObjectId
  offset Int    // index into content
}

// ============================================================================
// USER & SESSION
// ============================================================================

model User {
  id              String           @id @default(auto()) @map("_id") @db.ObjectId
  kind            UserKind         @default(registered)
  email           String?          // null for guests
  emailLower      String?          // lowercased email for case-insensitive uniqueness
  emailVerifiedAt DateTime?
  passwordHash    String?          // argon2id; null for OAuth-only & guests
  googleId        String?          // OAuth subject
  totpEnabled     Boolean          @default(false)
  totpSecretEnc   String?          // encrypted at rest; never leaves server
  recoveryCodeHashes String[]      @default([]) // hashed TOTP recovery codes
  profile         UserProfile
  usernameLower   String           // lowercased profile.username for uniqueness
  presence        PresenceSnapshot
  guestExpiresAt  DateTime?        // set when kind === guest (drives TTL, §7)
  deletedAt       DateTime?
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt

  // Back-relations (bounded, useful for typed access; semantically id references)
  sessions      Session[]
  memberships   Membership[]
  notifications Notification[]
  activityFeed  ActivityEvent[]

  @@unique([emailLower], map: "uniq_users_email_lower")     // partial: non-null, non-deleted (app-guarded)
  @@unique([usernameLower], map: "uniq_users_username_lower")
  @@unique([googleId], map: "uniq_users_google_id")
  @@index([guestExpiresAt])                                  // guest TTL sweep (§7)
  @@index([deletedAt])
  @@map("users")
}

model Session {
  id          String             @id @default(auto()) @map("_id") @db.ObjectId
  userId      String             @db.ObjectId
  user        User               @relation(fields: [userId], references: [id])
  device      DeviceMetadata
  tokenFamily RefreshTokenFamily
  lastSeenAt  DateTime           @default(now())
  expiresAt   DateTime           // ≤ createdAt + 30d (canon §8); drives TTL (§7)
  revokedAt   DateTime?
  createdAt   DateTime           @default(now())
  updatedAt   DateTime           @updatedAt

  @@index([userId])                       // list a user's device sessions (canon §4)
  @@index([expiresAt])                     // TTL sweep of expired sessions (§7)
  @@index([tokenFamily.familyId])          // reuse-detection lookup by family
  @@map("sessions")
}

// ============================================================================
// SOCIAL GRAPH
// ============================================================================

model Friendship {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  userIdA   String   @db.ObjectId // INVARIANT: userIdA < userIdB (canonical order)
  userIdB   String   @db.ObjectId
  createdAt DateTime @default(now()) // = acceptance time
  updatedAt DateTime @updatedAt

  @@unique([userIdA, userIdB], map: "uniq_friendships_pair") // canon §4 mandatory
  @@index([userIdB])                                          // reverse lookup (A is covered by the unique)
  @@map("friendships")
}

model FriendRequest {
  id          String              @id @default(auto()) @map("_id") @db.ObjectId
  requesterId String              @db.ObjectId
  addresseeId String              @db.ObjectId // INVARIANT: != requesterId
  status      FriendRequestStatus @default(pending)
  message     String?
  respondedAt DateTime?
  expiresAt   DateTime?           // drives expiry job / TTL (§7)
  createdAt   DateTime            @default(now())
  updatedAt   DateTime            @updatedAt

  @@index([addresseeId, status, createdAt]) // inbound pending requests, newest first
  @@index([requesterId, status])            // outbound requests
  @@index([expiresAt])                       // expiry sweep
  @@map("friend_requests")
}

model Block {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  blockerId String   @db.ObjectId
  blockedId String   @db.ObjectId // INVARIANT: != blockerId
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([blockerId, blockedId], map: "uniq_blocks_pair") // one block per directed pair
  @@index([blockedId])                                       // "who blocked me" / delivery suppression
  @@map("blocks")
}

// ============================================================================
// ROOM AGGREGATE
// ============================================================================

model Room {
  id                String         @id @default(auto()) @map("_id") @db.ObjectId
  name              String
  visibility        RoomVisibility @default(public)
  passwordHash      String?        // present iff visibility === password
  lifecycle         RoomLifecycle  @default(temporary)
  status            RoomStatus     @default(active)
  ownerId           String?        @db.ObjectId // null only while status === ownerless
  ownerDisplayName  String?        // denorm ← User.profile.displayName
  playlistId        String         @db.ObjectId // 1:1, immutable after create
  settings          RoomSettings
  playback          PlaybackState
  viewerCount       Int            @default(0)  // denorm ← active Membership count (discovery)
  currentVideoTitle String?        // denorm ← current QueueItem.title (discovery)
  nameLower         String         // lowercased name for search prefix index
  teardownAt        DateTime?      // set when status === teardown_scheduled (drives sweep, §7)
  deletedAt         DateTime?      // set on archive (terminal)
  createdAt         DateTime       @default(now())
  updatedAt         DateTime       @updatedAt

  // Back-relations (bounded query helpers)
  memberships   Membership[]
  voiceChannels VoiceChannel[]
  inviteLinks   InviteLink[]

  @@index([visibility, status])             // discovery list (canon §4: rooms (visibility,isActive))
  @@index([visibility, status, viewerCount(sort: Desc)]) // discovery sorted by popularity
  @@index([ownerId])
  @@index([nameLower])                       // room name prefix search
  @@index([teardownAt])                      // teardown sweep
  @@index([deletedAt])
  @@map("rooms")
}

model Membership {
  id               String           @id @default(auto()) @map("_id") @db.ObjectId
  roomId           String           @db.ObjectId
  room             Room             @relation(fields: [roomId], references: [id])
  userId           String           @db.ObjectId
  user             User             @relation(fields: [userId], references: [id])
  role             RoomRole         @default(Member)
  status           MembershipStatus @default(active)
  moderation       ModerationState
  userDisplayName  String           // denorm ← User.profile.displayName
  userAvatarUrl    String?          // denorm ← User.profile.avatarUrl
  joinedAt         DateTime         @default(now()) // ownership-transfer ordering tiebreaker
  lastActiveAt     DateTime         @default(now())
  createdAt        DateTime         @default(now())
  updatedAt        DateTime         @updatedAt

  @@unique([roomId, userId], map: "uniq_memberships_room_user") // canon §4 mandatory
  @@index([roomId, status, joinedAt])  // active members ordered by join (transfer + roster)
  @@index([roomId, role, joinedAt])    // oldest-joined moderator/member for transfer (canon §6)
  @@index([userId, status])            // "rooms I'm in"
  @@map("memberships")
}

model RoleAssignment {
  id           String               @id @default(auto()) @map("_id") @db.ObjectId
  roomId       String               @db.ObjectId
  membershipId String               @db.ObjectId
  userId       String               @db.ObjectId // subject (denorm convenience)
  previousRole RoomRole?
  newRole      RoomRole
  reason       RoleAssignmentReason
  assignedById String?              @db.ObjectId // null ⟺ reason === system
  createdAt    DateTime             @default(now()) // append-only: no updatedAt

  @@index([roomId, createdAt])       // room role-history audit, chronological
  @@index([membershipId, createdAt]) // per-membership history
  @@map("role_assignments")
}

model RoomBan {
  id           String    @id @default(auto()) @map("_id") @db.ObjectId
  roomId       String    @db.ObjectId
  userId       String    @db.ObjectId // subject of the ban — durable, survives Membership deletion
  bannedById   String    @db.ObjectId // moderator/owner who issued the ban
  reason       String?
  expiresAt    DateTime? // null = permanent; set for temp-ban → TTL sweep (§7)
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  @@unique([roomId, userId], map: "uniq_room_bans_room_user") // B3: one active ban row per (room,user); enforces ban-on-rejoin
  @@index([userId])                                            // "rooms this user is banned from"
  @@index([expiresAt])                                         // temp-ban TTL/expiry sweep (§7)
  @@map("room_bans")
}

model JoinRequest {
  id            String            @id @default(auto()) @map("_id") @db.ObjectId
  roomId        String            @db.ObjectId
  userId        String            @db.ObjectId // requester
  status        JoinRequestStatus @default(pending)
  message       String?           // optional note to approvers
  userDisplayName String          // denorm ← User.profile.displayName (approver list render)
  userAvatarUrl String?           // denorm ← User.profile.avatarUrl
  resolvedById  String?           @db.ObjectId // moderator/owner who approved/rejected
  resolvedAt    DateTime?
  expiresAt     DateTime          // ≈ createdAt + 10 min; drives TTL/expiry (§7)
  createdAt     DateTime          @default(now())
  updatedAt     DateTime          @updatedAt

  // B3: partial-unique on (roomId, userId) WHERE status = pending — only one OPEN request per (room,user).
  // Prisma cannot express a partial filter declaratively; the @@unique below documents intent and the
  // partial filter expression { status: "pending" } is applied via out-of-band migration (§7 / §8).
  @@unique([roomId, userId], map: "uniq_join_requests_room_user_pending") // partial: WHERE status = pending (migration-applied)
  @@index([roomId, status, createdAt]) // approver queue: pending requests for a room, oldest first
  @@index([userId, status])            // "my outstanding join requests"
  @@index([expiresAt])                 // pending-request expiry/TTL sweep (§7)
  @@map("join_requests")
}

// ============================================================================
// PLAYLIST / MEDIA
// ============================================================================

model Playlist {
  id            String   @id @default(auto()) @map("_id") @db.ObjectId
  roomId        String   @db.ObjectId // INVARIANT: 1:1 with Room
  currentItemId String?  @db.ObjectId // mirrors Room.playback.itemId
  itemCount     Int      @default(0)  // denorm ← count of non-removed QueueItems
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@unique([roomId], map: "uniq_playlists_room") // enforces 1:1
  @@map("playlists")
}

model QueueItem {
  id                 String          @id @default(auto()) @map("_id") @db.ObjectId
  playlistId         String          @db.ObjectId
  provider           MediaProvider   @default(youtube)
  providerId         String          // YouTube video id
  title              String          // denorm ← provider metadata at add time
  durationMs         Int             // denorm ← provider metadata
  thumbnailUrl       String?
  addedById          String          @db.ObjectId
  addedByDisplayName String          // denorm ← User.profile.displayName (immutable snapshot)
  position           Float           // fractional ordering key (drag-reorder, no renumber)
  status             QueueItemStatus @default(queued)
  tally              VoteTally
  skipThreshold      Int?            // votes needed to skip (room-derived at eval time)
  createdAt          DateTime        @default(now())
  updatedAt          DateTime        @updatedAt

  @@index([playlistId, status, position]) // ordered render of the live queue
  @@index([playlistId, createdAt])         // history / "recently added"
  @@map("queue_items")
}

model Vote {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  queueItemId String   @db.ObjectId
  userId      String   @db.ObjectId
  kind        VoteKind
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([queueItemId, userId, kind], map: "uniq_votes_ballot") // one ballot per (item,user,kind)
  @@index([queueItemId, kind])                                     // tally re-derivation
  @@map("votes")
}

// ============================================================================
// CHAT & DM
// ============================================================================

model Message {
  id                String        @id @default(auto()) @map("_id") @db.ObjectId
  channelKind       ChannelKind
  channelId         String        @db.ObjectId // roomId (room) or dmThreadId (dm) — polymorphic, no @relation
  authorId          String        @db.ObjectId
  authorDisplayName String        // denorm ← User.profile.displayName (immutable snapshot)
  authorAvatarUrl   String?       // denorm ← User.profile.avatarUrl (immutable snapshot)
  content           String
  mentions          Mention[]     // embedded
  reactions         Reaction[]    // embedded, capped — unbounded reaction lists forbidden
  attachments       Attachment[]  // embedded, capped
  status            MessageStatus @default(visible)
  editedAt          DateTime?
  deletedAt         DateTime?
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt

  @@index([channelId, createdAt])             // canon §4: messages (roomId, createdAt) — channel timeline
  @@index([channelId, deletedAt, createdAt])  // visible-only timeline pagination
  @@map("messages")
}

model DmThread {
  id                 String   @id @default(auto()) @map("_id") @db.ObjectId
  participantIds     String[] @db.ObjectId // exactly 2 for v1; sorted canonically
  participantKey     String   // "minId:maxId" — unique per pair
  lastMessageAt      DateTime? // denorm ← latest Message.createdAt
  lastMessagePreview String?   // denorm, truncated
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  @@unique([participantKey], map: "uniq_dm_threads_pair") // one thread per participant pair
  @@index([participantIds])                                // "my DM threads" (multikey)
  @@index([participantIds, lastMessageAt(sort: Desc)])     // inbox ordered by recency
  @@map("dm_threads")
}

// ============================================================================
// NOTIFICATIONS & ACTIVITY
// ============================================================================

model Notification {
  id        String           @id @default(auto()) @map("_id") @db.ObjectId
  userId    String           @db.ObjectId // recipient
  user      User             @relation(fields: [userId], references: [id])
  type      NotificationType
  actorId   String?          @db.ObjectId // who triggered it
  roomId    String?          @db.ObjectId
  payload   Json             // type-specific, validated per type (discriminated union DTO)
  seenAt    DateTime?
  readAt    DateTime?
  createdAt DateTime         @default(now())
  updatedAt DateTime         @updatedAt

  @@index([userId, readAt, createdAt]) // canon §4: notifications (userId, readAt, createdAt) — unread feed
  @@index([userId, createdAt])         // full feed pagination
  @@map("notifications")
}

model ActivityEvent {
  id        String            @id @default(auto()) @map("_id") @db.ObjectId
  userId    String            @db.ObjectId // feed owner
  user      User              @relation(fields: [userId], references: [id])
  type      ActivityEventType
  actorId   String?           @db.ObjectId
  subjectId String?           @db.ObjectId // roomId / userId / queueItemId etc.
  payload   Json
  createdAt DateTime          @default(now()) // append-only: no updatedAt, no soft delete

  @@index([userId, createdAt]) // chronological feed
  @@map("activity_events")
}

// ============================================================================
// VOICE & INVITES
// ============================================================================

model VoiceChannel {
  id                    String          @id @default(auto()) @map("_id") @db.ObjectId
  roomId                String          @db.ObjectId
  room                  Room            @relation(fields: [roomId], references: [id])
  name                  String
  visibility            VoiceVisibility @default(public)
  passwordHash          String?         // present iff visibility === password
  livekitRoom           String          // LiveKit room name, deterministic from id (ADR-005)
  videoEnabled          Boolean         @default(true)
  screenShareEnabled    Boolean         @default(true)
  maxParticipants       Int?
  activeParticipantCount Int            @default(0) // denorm ← LiveKit presence
  deletedAt             DateTime?
  createdAt             DateTime        @default(now())
  updatedAt             DateTime        @updatedAt

  @@unique([livekitRoom], map: "uniq_voice_channels_livekit") // stable SFU mapping
  @@index([roomId])
  @@map("voice_channels")
}

model InviteLink {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  roomId      String   @db.ObjectId
  createdById String   @db.ObjectId
  token       String   // opaque, high-entropy
  grantsRole  RoomRole @default(Member) // INVARIANT: never Owner
  maxUses     Int?     // null = unlimited
  useCount    Int      @default(0)
  expiresAt   DateTime?
  revokedAt   DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([token], map: "uniq_invite_links_token") // redemption lookup
  @@index([roomId])                                  // room's active invites
  @@index([expiresAt])                               // expiry sweep
  @@map("invite_links")
}
```

---

## 4. Per-Collection Embed-vs-Reference Notes & Tradeoffs

Each note states *what is embedded, what is referenced, and why* — the decision that defends the document shape against the [§1.2 rule](#12-embed-vs-reference--the-decision-rule).

### 4.1 `users`

- **Embedded:** `UserProfile` (bounded, always read with the account), `PresenceSnapshot` (a single durable mirror of realtime presence). Both are value objects with no independent query needs.
- **Referenced out:** sessions, memberships, notifications, activity, and all social edges are **separate collections** — every one of them is unbounded and queried independently.
- **Tradeoff:** `usernameLower` / `emailLower` are stored redundantly to support **case-insensitive uniqueness** (MongoDB unique indexes are case-sensitive; collation per-index on Atlas is avoided for portability). Cost: two extra lowercase fields kept in sync at write time. Benefit: a single unique index enforces the handle/email invariant without a query.
- **Why not embed memberships?** A power user can be in hundreds of rooms; embedding would grow the user document unboundedly and rewrite it on every join — a [hard-rule](#12-embed-vs-reference--the-decision-rule) violation.

### 4.2 `sessions`

- **Embedded:** `DeviceMetadata` and `RefreshTokenFamily` (hashed) — both are tightly owned by the session and always read together with it. The token family is **never** a separate collection: rotation must be atomic with the session row.
- **Referenced out:** `userId` only.
- **Tradeoff:** one document per device keeps revocation independent (canon §8) and lets a single TTL index expire the row when `expiresAt` passes (see [§7](#7-data-retention--ttl-policy)). We index `tokenFamily.familyId` to make reuse-detection a point lookup.

### 4.3 `friendships`, `friend_requests`, `blocks`

- **Referenced, never embedded.** Social edges are their own aggregates so they can be queried symmetrically and counted without loading user documents.
- **Friendship canonicalization:** storing the unordered pair as `(userIdA < userIdB)` plus a unique index guarantees **exactly one row per pair** regardless of who initiated. The reverse-direction lookup is served by an index on `userIdB` (the `(A,B)` unique already covers `A`).
- **Tradeoff:** symmetric queries ("are these two friends?") must canonicalize the pair before lookup — pushed into a repository helper, never duplicated.
- **Blocks** are directed (one row per `blocker → blocked`) and indexed on `blockedId` for fast delivery-suppression checks ("is the recipient blocked by the actor?").

### 4.4 `rooms`

- **Embedded:** `RoomSettings` and `PlaybackState` — both bounded value objects read on every room load and written by the room's own services. Embedding `PlaybackState` keeps the **server-authoritative clock** (canon §7) co-located with the room for single-document atomic updates on play/pause/seek.
- **Referenced out:** memberships, playlist (`playlistId`), voice channels, invite links, messages — all unbounded.
- **Denormalization (discovery-critical):** `currentVideoTitle`, `viewerCount`, `ownerDisplayName` live on the room so a Discovery card renders from one document with no fan-out. These are eventually consistent ([§5](#5-denormalization--source-of-truth-register)).
- **Tradeoff:** every membership join/leave and playlist advance must re-fan a tiny write into the room document. This is accepted: discovery read volume vastly exceeds join/advance write volume.

### 4.5 `memberships`

- **Not a join table.** A first-class aggregate (carries role, `ModerationState`, denormalized identity). Embedded `ModerationState` is bounded and always read with the membership.
- **Referenced:** `roomId`, `userId`.
- **Denormalization:** `userDisplayName` / `userAvatarUrl` let the room roster and chat author chips render without touching `users`. Source of truth is `User.profile`; refreshed via realtime re-fan on profile change.
- **Critical indexes:** `(roomId, role, joinedAt)` directly serves the [ownership-transfer algorithm](../context/architecture.md#6-permission-model) — "oldest-joined active Moderator, else oldest-joined active Member." `(roomId, userId)` unique enforces one membership per user per room.

### 4.6 `role_assignments`

- **Separate, append-only.** Not embedded on `Membership` (role history grows unbounded and is queried independently for audit — a hard-rule case and [DOMAIN Open Q #4](./DOMAIN.md#8-open-questions)).
- **No `updatedAt`, no soft delete** — it is an immutable audit log. Retained per [§7](#7-data-retention--ttl-policy).

### 4.6a `room_bans` (B3 — resolves PERMISSIONS OQ-2)

- **Separate collection, never embedded on `Membership`.** A ban must **outlive membership deletion** — when a kicked/banned user's `Membership` is removed (or they leave), the ban record persists so a rejoin attempt is rejected. Embedding the ban on `Membership` would lose the ban the moment the membership row goes away, which is exactly the wrong behavior.
- **Referenced:** `roomId`, `userId`, `bannedById`.
- **Uniqueness:** `(roomId, userId)` unique guarantees one active ban row per user per room and makes the rejoin check a point lookup.
- **TTL:** optional `expiresAt` supports **temp-bans** — a native TTL index removes the row when it passes; a null `expiresAt` is a permanent ban with no TTL ([§7](#7-data-retention--ttl-policy)).

### 4.6b `join_requests` (B3 — resolves PERMISSIONS OQ-4)

- **Separate collection.** The pending join-approval queue for rooms with `settings.joinApprovalRequired = true`. Unbounded over a room's lifetime and queried independently by approvers, so never embedded on `Room`.
- **Referenced:** `roomId`, `userId`, `resolvedById`. **Denormalized** `userDisplayName`/`userAvatarUrl` let the approver queue render without touching `users`.
- **Partial-uniqueness:** `(roomId, userId)` is unique **only `WHERE status = pending`** — a user may have at most one *open* request per room but can re-request after a prior request resolves (approved/rejected/expired). Prisma cannot express the partial filter declaratively, so the `@@unique` documents intent and the partial filter expression is applied out-of-band (mirrors the `emailLower`/`usernameLower` pattern; see [§8](#8-open-questions)).
- **TTL:** `expiresAt` (≈ `createdAt + 10 min`) auto-expires unanswered requests so the approver queue self-cleans; the [expiry sweep](#72-sweep-jobs-conditional--cascading--cannot-be-a-raw-ttl-index) flips `status = expired` before hard removal.

### 4.7 `playlists` & `queue_items`

- **Playlist is a thin 1:1 root** (unique on `roomId`) holding ordering metadata (`currentItemId`, denormalized `itemCount`). It does **not** embed items.
- **QueueItem is referenced** (unbounded queue). Embedded `VoteTally` is a denormalized rollup of the `votes` collection; `Vote` rows are the source of truth so individual ballots can be enforced unique per `(queueItemId, userId, kind)` and retracted independently.
- **Fractional `position`** (Float) enables O(1) drag-reorder: insert between two items by averaging their positions — no renumbering write storm.
- **Tradeoff:** the `tally` denorm can briefly lag the `votes` collection; the [skip-vote outcome](./DOMAIN.md#64-queue-item-voting) is evaluated server-side against a fresh count at commit time, not the cached tally, so correctness never depends on the lag.

### 4.8 `votes`

- **Separate collection** so the `(queueItemId, userId, kind)` uniqueness and independent retraction are enforceable. Embedding votes in `QueueItem` would make the item document grow with viewer count and race on concurrent casts.

### 4.9 `messages`

- **Separate collection — the canonical unbounded case.** One document per message, back-referenced by **polymorphic `channelId`** (a room id *or* a dm-thread id, discriminated by `channelKind`). No `@relation` on `channelId` precisely because it is polymorphic.
- **Embedded (capped):** `reactions`, `attachments`, `mentions`. Reactions are bounded by capping distinct emojis and userIds-per-emoji at the application layer; this keeps the common "render a message with its reactions" a single read while honoring the no-unbounded-embed rule.
- **Denormalization:** `authorDisplayName` / `authorAvatarUrl` are **immutable snapshots at send time** — they intentionally do *not* refresh, preserving the identity shown when the message was sent.
- **Index:** `(channelId, createdAt)` is the canon-mandated chat timeline index; `(channelId, deletedAt, createdAt)` serves visible-only pagination.

### 4.10 `dm_threads`

- **Thread root holds the participant id array embedded** (`participantIds`, exactly 2 for v1) plus a derived `participantKey` (`"minId:maxId"`) that a unique index uses to guarantee one thread per pair. Messages are referenced (unbounded), not embedded.
- **Denormalization:** `lastMessageAt` / `lastMessagePreview` power the DM inbox list without scanning `messages`.
- **Tradeoff:** the `participantKey` redundancy buys a single-index uniqueness guarantee that a multikey array alone cannot provide.

### 4.11 `notifications` & `activity_events`

- **Both per-user, referenced, unbounded** → separate collections (never embedded on `User`).
- **Kept distinct** ([DOMAIN Open Q #5](./DOMAIN.md#8-open-questions)): notifications are actionable alerts with `seenAt`/`readAt` state and TTL; activity events are an append-only chronological stream. Different read models, different retention.
- **`payload` is `Json`** (schemaless per type) but validated by a per-`type` discriminated-union DTO at the service boundary — the database stores the bag, the application owns the shape.

### 4.12 `voice_channels` & `invite_links`

- **Referenced to `rooms`.** Voice channels are bounded per room but warrant their own collection because `livekitRoom` must be globally unique (stable SFU mapping, ADR-005) and participant counts update independently of the room document.
- **Invite links** are unbounded over a room's lifetime (many short-lived tokens) and looked up by `token` on redemption → separate collection with a unique `token` index and an `expiresAt` index for sweeping.

---

## 5. Denormalization & Source-of-Truth Register

This mirrors the [DOMAIN denormalization register](./DOMAIN.md#7-denormalization-source-of-truth-register) and pins each denormalized field to a concrete schema location. Every entry is **eventually consistent**; the source aggregate is authoritative and re-fans updates via realtime + background reconciliation (canon §4).

| Field (in this schema) | On model | Source of truth | Refresh trigger | Refresh nature |
|---|---|---|---|---|
| `userDisplayName`, `userAvatarUrl` | `Membership` | `User.profile` | profile update | re-fan to all active memberships |
| `ownerId`, `ownerDisplayName` | `Room` | `Membership(Owner)` / `User.profile` | ownership transfer / profile update | single-doc write on transfer |
| `authorDisplayName`, `authorAvatarUrl` | `Message` | `User.profile` (at send) | — | **immutable snapshot** (never refreshed) |
| `addedByDisplayName` | `QueueItem` | `User.profile` (at add) | — | **immutable snapshot** |
| `currentVideoTitle` | `Room` | current `QueueItem.title` | playlist advance | single-doc write on advance |
| `viewerCount` | `Room` | active `Membership` count | join / leave | increment/decrement on event |
| `tally` (`up`/`down`/`skip`) | `QueueItem` | `votes` collection | vote cast / clear | re-derive count for `kind` |
| `itemCount` | `Playlist` | non-removed `QueueItem` count | item add / remove | increment/decrement |
| `lastMessageAt`, `lastMessagePreview` | `DmThread` | latest non-deleted `Message` | message send / delete | single-doc write |
| `activeParticipantCount` | `VoiceChannel` | LiveKit presence | LiveKit webhook / heartbeat | reconcile on event |
| `currentItemId` | `Playlist` | `Room.playback.itemId` | playlist advance | kept equal on advance |

**Reconciliation policy:** realtime re-fan handles the hot path; a periodic **background reconciler** re-derives counters (`viewerCount`, `itemCount`, `tally`, `activeParticipantCount`) from their source collections to repair drift after missed events or crashes. Immutable snapshots (`Message`, `QueueItem` author fields) are *never* reconciled — they are point-in-time identity by design.

---

## 6. Indexing Strategy

Indexes follow the [canon §4 pattern](../context/architecture.md#4-data-modeling-conventions-mongodb--prisma): index every foreign key used in a query filter; order compound indexes **equality → sort → range** (ESR rule). Every canon-mandated index is present and annotated in the [§3 schema](#3-full-prisma-schema-canonical-schema-in-design).

### 6.1 Canon-mandated indexes (verbatim coverage)

| Canon requirement | Realized as |
|---|---|
| `memberships (roomId, userId)` unique | `@@unique([roomId, userId])` on `Membership` |
| `messages (roomId, createdAt)` | `@@index([channelId, createdAt])` on `Message` (channelId = roomId for room chat) |
| `notifications (userId, readAt, createdAt)` | `@@index([userId, readAt, createdAt])` on `Notification` |
| `sessions (userId)` | `@@index([userId])` on `Session` |
| `friendships (userIdA, userIdB)` unique | `@@unique([userIdA, userIdB])` on `Friendship` |
| `rooms (visibility, isActive)` for discovery | `@@index([visibility, status])` on `Room` (`status` encodes active/idle/etc.) |
| text-eligible fields → separate search index | Atlas Search indexes (see [§6.4](#64-text-search-indexes)) |

### 6.2 Uniqueness / integrity indexes

- `users`: `usernameLower`, `emailLower`, `googleId` unique (case-insensitive identity).
- `playlists`: `roomId` unique (enforces the 1:1 Room↔Playlist invariant).
- `votes`: `(queueItemId, userId, kind)` unique (one ballot per item per user per kind).
- `blocks`: `(blockerId, blockedId)` unique (one block per directed pair).
- `dm_threads`: `participantKey` unique (one thread per pair).
- `voice_channels`: `livekitRoom` unique (stable SFU mapping).
- `invite_links`: `token` unique (redemption lookup).
- `room_bans`: `(roomId, userId)` unique (one active ban per user per room; rejoin check is a point lookup). *(B3)*
- `join_requests`: `(roomId, userId)` **partial-unique `WHERE status = pending`** (one open request per user per room; partial filter applied out-of-band — see [§8](#8-open-questions)). *(B3)*

### 6.3 Query-pattern compound indexes (ESR-ordered)

| Index | Serves |
|---|---|
| `memberships (roomId, status, joinedAt)` | room roster of active members, ordered by join |
| `memberships (roomId, role, joinedAt)` | ownership-transfer successor selection (canon §6) |
| `memberships (userId, status)` | "rooms I'm in" |
| `rooms (visibility, status, viewerCount desc)` | discovery sorted by popularity |
| `queue_items (playlistId, status, position)` | ordered live-queue render |
| `messages (channelId, deletedAt, createdAt)` | visible-only timeline pagination |
| `notifications (userId, createdAt)` | full feed pagination |
| `friend_requests (addresseeId, status, createdAt)` | inbound pending requests |
| `dm_threads (participantIds, lastMessageAt desc)` | DM inbox by recency (multikey + sort) |
| `votes (queueItemId, kind)` | tally re-derivation per kind |
| `role_assignments (roomId, createdAt)` | room role-history audit, chronological *(B4)* |
| `role_assignments (membershipId, createdAt)` | per-membership role history *(B4)* |
| `room_bans (userId)` | "rooms this user is banned from" *(B3)* |
| `join_requests (roomId, status, createdAt)` | approver queue: pending requests for a room, oldest first *(B3)* |
| `join_requests (userId, status)` | "my outstanding join requests" *(B3)* |
| `activity_events (userId, createdAt)` | chronological social feed *(B3 confirm)* |

### 6.4 Text / search indexes

Cowatch search spans users, rooms, messages, videos, and tags ([SPEC Discovery](../context/architecture.md#1-glossary-of-core-domain-terms)). MongoDB's single-text-index-per-collection limit and ranking weakness make **MongoDB Atlas Search (Lucene-backed)** the chosen search backend — declared **outside** the Prisma schema as Atlas Search index definitions (Prisma does not model these). Targets:

- `users.profile.displayName`, `users.profile.username` — user/friend search.
- `rooms.name`, `rooms.settings.tags` — room + tag search.
- `messages.content` — in-room/DM message search (scoped + permission-filtered at query time).
- `queue_items.title` — video search within a room.

For self-hosted / non-Atlas environments, the fallback is a single MongoDB `$text` index per searchable collection plus prefix indexes (`nameLower`, `usernameLower`) for typeahead. The lowercase prefix fields in the schema (`nameLower`, `usernameLower`, `emailLower`) support typeahead without the search engine.

### 6.5 Index hygiene rules

- **No index without a query.** Every `@@index` above maps to a named access path. Unused indexes are removed (they cost write throughput and RAM).
- **Multikey caution.** `dm_threads.participantIds` and `message.mentions.userId` are multikey; we never compound two array fields in one index (MongoDB forbids it).
- **Covered counters via reconciliation, not aggregation on read.** Discovery never runs a live `count()` over `memberships`; it reads the denormalized `Room.viewerCount`.

---

## 7. Data Retention & TTL Policy

Retention is enforced by a mix of **MongoDB native TTL indexes** (for time-bomb data) and **scheduled background sweep jobs** (for conditional/cascading cleanup that a TTL index cannot express). All timestamps are UTC (canon §10).

> Prisma does not declare TTL indexes in the schema. They are created out-of-band (migration script / init job) on the fields noted below. This section is the authoritative spec for those index definitions and jobs.

### 7.1 TTL-indexed (native MongoDB `expireAfterSeconds`)

| Collection | TTL field | Policy | Notes |
|---|---|---|---|
| `sessions` | `expiresAt` | expire at `expiresAt` (≤ createdAt + 30d, canon §8) | TTL index `expireAfterSeconds: 0` on `expiresAt`; revoked sessions also expire here once `expiresAt` is backdated on revoke |
| `users` (guests) | `guestExpiresAt` | expire guest accounts at `guestExpiresAt` | **Conditional** — guests only. Because TTL cannot filter by `kind`, guest cleanup runs as a **sweep job** (see §7.2), not a raw TTL index, to avoid expiring registered users that have a null field |
| `friend_requests` | `expiresAt` | expire stale pending requests | TTL `expireAfterSeconds: 0`; the [expiry transition](./DOMAIN.md#63-friend-request-lifecycle) sets `status = expired` via the sweep before/at hard removal |
| `invite_links` | `expiresAt` | remove expired tokens | TTL `expireAfterSeconds: 0`; revoked links backdate `expiresAt` |
| `room_bans` | `expiresAt` | expire **temp-bans** at `expiresAt` | TTL `expireAfterSeconds: 0`; **permanent bans have a null `expiresAt`** and are never expired (TTL skips null-keyed docs). *(B3)* |
| `join_requests` | `expiresAt` | expire stale **pending** requests (≈10 min) | TTL `expireAfterSeconds: 0`; the [expiry sweep](#72-sweep-jobs-conditional--cascading--cannot-be-a-raw-ttl-index) flips `status = expired` before/at hard removal. *(B3)* |
| `notifications` | `createdAt` | retain 90 days | TTL `expireAfterSeconds: 7776000` — feed is ephemeral; read state is not durable history |
| `activity_events` | `createdAt` | retain 180 days | TTL `expireAfterSeconds: 15552000` — append-only stream, rolling window *(B3 confirm)* |

### 7.2 Sweep jobs (conditional / cascading — cannot be a raw TTL index)

| Job | Cadence | Action |
|---|---|---|
| **Guest reaper** | every 15 min | hard-delete `users` where `kind = guest` AND `guestExpiresAt < now`; cascade-delete their `sessions`, `memberships`, transient `presence`. (Conditional on `kind`, so not a raw TTL index.) |
| **Ephemeral-room teardown** | every 1 min | for `rooms` where `lifecycle = temporary` AND `status = teardown_scheduled` AND `teardownAt < now`: set `status = archived`, `deletedAt = now`; cascade soft-delete `memberships`, `voice_channels`, `invite_links`; schedule `messages`/`queue_items` purge. Implements the [Room lifecycle](./DOMAIN.md#61-room-lifecycle). |
| **Friend-request expirer** | every 5 min | set `status = expired` on `pending` requests past `expiresAt` (state transition) before TTL hard-removes the row. |
| **Join-request expirer** | every 1 min | set `status = expired` on `pending` `join_requests` past `expiresAt` (state transition) before the TTL index hard-removes the row, so the approver queue and the partial-unique constraint stay consistent. *(B3)* |
| **Soft-delete purger** | nightly | hard-delete rows soft-deleted (`deletedAt`) beyond the grace window (default **30 days**): archived `rooms` and their `messages`/`queue_items`/`playlists`, deleted `users` (post legal hold), tombstoned `messages`. |
| **Denorm reconciler** | every 10 min | re-derive `viewerCount`, `itemCount`, `tally`, `activeParticipantCount` from source collections to repair drift (see [§5](#5-denormalization--source-of-truth-register)). |
| **Session-family pruner** | hourly | hard-delete revoked `sessions` whose `expiresAt` already passed, in case TTL lagged; collapse reuse-detected families. |

### 7.3 Retention rationale & exceptions

- **Messages are retained for the life of their channel**, not on a clock — chat history is product data. They are purged only when their room is archived-and-purged (room teardown grace) or when a DM thread is deleted. Tombstoned (deleted) messages keep their row for thread integrity until the room/thread purge.
- **`role_assignments` and `friendships` have no TTL** — audit and social graph are durable history.
- **`room_bans` are durable by default** — a permanent ban (`expiresAt: null`) is never expired and **outlives the banned user's membership deletion**, so a rejoin is rejected on a point lookup. Only temp-bans (non-null `expiresAt`) are TTL-reaped. *(B3)*
- **Soft delete first, hard delete on a grace window.** Nothing is hard-deleted immediately except guests and expired tokens; a 30-day grace supports recovery, abuse investigation, and accidental-delete reversal.
- **Right-to-erasure (GDPR-style):** a user-deletion request soft-deletes immediately, anonymizes denormalized snapshots (`authorDisplayName` → "Deleted User") via a one-shot job, and schedules hard purge after any legal-hold window. Tracked as an [open question](#8-open-questions) pending the privacy spec.
- **PII minimization:** `sessions` store `ipRegion` (coarse geo), never raw IP, at rest. `totpSecretEnc` and `recoveryCodeHashes` are encrypted/hashed; they are excluded from any export.

---

## 8. Open Questions

> Amended 2026-06-27: All six DB Open Questions below were ruled on by the Chief Architect (RESOLUTIONS DB OQ-1…OQ-6). The **Resolution** column records each decision and its status. None of these is an architectural-decision change → history+context update only, no ADR (R3/R4).

| # | Question | Recommendation | Resolution (2026-06-27) |
|---|---|---|---|
| 1 | Should `emailLower` / `usernameLower` uniqueness be partial (exclude soft-deleted) — which MongoDB supports but Prisma cannot express declaratively? | Create the unique indexes as **partial filter expressions** (`deletedAt: null`) via an out-of-band migration; document the divergence from the Prisma `@@unique`. Confirm in the auth spec. | **DB OQ-1:** Create `emailLower`/`usernameLower` partial-unique indexes (`deletedAt: null`) via an out-of-band migration; document the divergence from Prisma `@@unique` and confirm in `specs/auth.spec.md` + `history/migrations.md`. The same partial-index mechanism applies to `join_requests` (`WHERE status = pending`). — **Status: Resolved.** |
| 2 | Is `Json` the right type for `Notification.payload` / `ActivityEvent.payload`, or should each type get a concrete embedded `type`? | Keep `Json` for v1 (open set of types, fast iteration); validate with per-`type` DTOs. Revisit if query-on-payload becomes a need. | **DB OQ-2:** Keep `Json` payloads with per-type DTO validation at the service boundary; revisit only if query-on-payload becomes a need. — **Status: Resolved.** |
| 3 | Atlas Search vs. self-hosted `$text` — which is the default, given Docker-first / VPS targets (ADR-010)? | Default to **Atlas Search** in managed prod; ship a **`$text` + prefix-index fallback** for self-hosted/VPS so search degrades gracefully. Needs a DevOps + Discovery decision. | **DB OQ-3:** Atlas Search is the managed-prod default; `$text` + prefix-index is the self-hosted fallback; native Mongo text indexes ship first and an external search engine + ADR comes only if discovery acceptance fails. — **Status: Deferred-to-Phase-7** (see [§6.4](#64-text--search-indexes), `docs/PHASES.md` P7). |
| 4 | Should `messages` be **time-sharded** (per-room rolling collections) at scale, or stay a single collection with the `(channelId, createdAt)` index? | Single collection for v1; the index handles expected volume. Reserve a sharding/archival ADR for when a room's message count or total collection size warrants it. | **DB OQ-4:** `messages` stays a single collection for v1; a sharding/archival ADR is reserved for when room message count or collection size warrants it. — **Status: Deferred-to-Phase-7+.** |
| 5 | Right-to-erasure: hard-delete vs. crypto-shred for users with denormalized snapshots scattered across `messages`/`queue_items`? | **Anonymize-in-place** the denormalized snapshots + soft-delete the `User`, then hard-purge after legal hold — avoids chasing every snapshot synchronously. Finalize in the privacy spec. | **DB OQ-5:** GDPR right-to-erasure = **anonymize-in-place** denormalized snapshots + soft-delete the `User`, then hard-purge after the legal-hold window. Finalize in the privacy spec. — **Status: Deferred-to-Post-MVP.** |
| 6 | Does `PlaybackState.serverEpochMs` as `Float` risk precision loss at large epoch values? | `Float` (double) holds epoch-ms exactly well past year 2100; acceptable. If sub-ms or BigInt precision is ever required, switch to `BigInt` — flagged for the Realtime Engineer. | **DB OQ-6:** `serverEpochMs` as `Float` (double) holds epoch-ms exactly well past year 2100 — **keep `Float`.** Switch to `BigInt` only if sub-ms/BigInt precision is ever required. — **Status: Resolved.** |

### 8.1 Sharding posture (ARCH OQ-2)

Collection sharding is **deferred**; when adopted, the shard key for room-scoped collections (`memberships`, `messages`, `queue_items`, `votes`, `role_assignments`, `room_bans`, `join_requests`) is **`roomId`**, decided in a dedicated sharding ADR at adoption. — **Status: Deferred-to-Phase-7** (mirrors `docs/ARCHITECTURE.md` §10).

---

*This document is downstream of and bound by the [Architecture Canon](../context/architecture.md) and the [Domain Model](./DOMAIN.md). Any change to a collection, field type, index, or retention policy is a data-model change and MUST travel with a history entry + context update (canon §10, R3/R4); changes that alter an architectural decision additionally require an ADR.*
