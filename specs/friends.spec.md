# Friends Feature Specification

> One-line purpose: The R5 specification for Cowatch's friendship graph — friend requests, the accepted-friendship aggregate, unfriend/block interaction, presence-enriched friend lists, and the privacy gates that govern who may connect — defining exactly what must be built, tested, and accepted before any code is written.

- **Status:** Draft (Planning, Phase 5 — Friends) — code-blocked until this spec + tasks + tests + docs exist (R5)
- **Owner agent:** Social / Voice Engineer
- **Last updated: 2026-06-27**

**Canon & cross-links**

- [Architecture Canon](../context/architecture.md) — single source of truth ([§1 Glossary](../context/architecture.md#1-glossary-of-core-domain-terms), [§3 Naming](../context/architecture.md#3-naming-conventions), [§4 Data Modeling](../context/architecture.md#4-data-modeling-conventions-mongodb--prisma), [§5 Realtime](../context/architecture.md#5-realtime-transport-abstraction-adr-004), [§8 Auth](../context/architecture.md#8-auth--token-model-adr-008), [§10 Non-Negotiables](../context/architecture.md#10-cross-cutting-non-negotiables))
- Design docs: [Social System Architecture §2](../docs/SOCIAL.md#2-friends--friend-requests), [§3 Presence](../docs/SOCIAL.md#3-presence), [§7 Blocks](../docs/SOCIAL.md#7-blocked-users-semantics), [§8 Profiles & Privacy](../docs/SOCIAL.md#8-user-profiles--privacy-settings) · [Domain Model](../docs/DOMAIN.md) · [Events §5.8 social](../docs/EVENTS.md#58-social-social) · [Permissions](../docs/PERMISSIONS.md)
- ADRs: [ADR-003 Prisma/MongoDB](../adr/ADR-003-prisma.md) · [ADR-004 Realtime abstraction](../adr/ADR-004-realtime.md) · [ADR-008 Auth tokens](../adr/ADR-008-auth.md) · [ADR-009 MinIO storage](../context/architecture.md#2-canonical-architecture-decisions-one-line--adr-id) (avatars; ADR file pending)
- Sibling specs: [notifications.spec.md](./notifications.spec.md) · [discovery.spec.md](./discovery.spec.md) · [voice.spec.md](./voice.spec.md)
- Implementation tasks (planned): [tasks/friends.md](../tasks/friends.md)

> **Conflict rule.** On any discrepancy between this spec and the [canon](../context/architecture.md) or the [Social design doc](../docs/SOCIAL.md), those win. This spec narrows the design doc into buildable, testable units; it does not re-decide aggregate boundaries, the friend-request state machine, the block cascade, or naming.

Owning NestJS module: **`SocialModule`** (`apps/server/src/modules/social/`). Shared graph helpers and the block predicate live in **`packages/social`**; canonical types in **`packages/types`**; Prisma model in **`packages/database`** (collections `friendships`, `friend_requests`, `blocks` — canon §3).

---

## 1. Overview & User Value

Friendship is the durable spine of Cowatch's social layer. It is what turns a transient watch room into a recurring community: it powers presence dots ("who's online right now"), the `friend.online` and `friend.room_started` notifications that pull users back in, friend-scoped privacy (DMs, activity feed, friends-of-friends requests), and the "friends inside" badge in [discovery](./discovery.spec.md).

A **Friendship** (canon §1) is a *mutual, accepted* relationship between two Users; its pending precursor is a directed **FriendRequest**. The feature delivers, for a registered user:

- Send / accept / decline / cancel friend requests, with reverse-pending **auto-accept**.
- A presence-enriched **friends list** and **mutual-friends** count.
- **Unfriend**, and the friend-facing half of **block** (the full block cascade is specified in [notifications.spec.md §Blocks cross-ref](./notifications.spec.md) and [Social §7](../docs/SOCIAL.md#7-blocked-users-semantics); this spec owns its friend-graph effects).
- Privacy gating of inbound requests (`everyone` / `friends_of_friends` / `none`).

**Primary persona:** "The Regular" — returns nightly, wants to see which friends are online and jump into their rooms. **Value metric:** % of room joins originating from a friend signal (presence/notification) vs. cold discovery.

---

## 2. Scope

### 2.1 In scope

- `FriendRequest` lifecycle (send, accept, decline, cancel, expire, auto-accept) per the [state machine](../docs/SOCIAL.md#22-friend-request-state-machine).
- `Friendship` aggregate: canonical-pair storage (`userIdA < userIdB`), creation on accept, deletion on unfriend.
- Friend-graph effects of **block** creation (dissolve friendship, cancel pending requests) — the friend-graph slice of the [§7 cascade](../docs/SOCIAL.md#71-model--cascade).
- Friends list & friend-request lists (incoming/outgoing), presence-enriched via [presence](../docs/SOCIAL.md#3-presence).
- Mutual-friends count and `friends_of_friends` request eligibility.
- Privacy enforcement for inbound requests (`friendRequestPolicy`) and block precedence.
- REST + realtime (`social:friend:*`) surfaces; idempotency, error envelope, correlation IDs.
- Expiry sweep job for stale pending requests (`FRIEND_REQUEST_TTL`, default 30 days).

### 2.2 Out of scope (owned elsewhere)

- **Presence derivation & fan-out** — owned by [Social §3](../docs/SOCIAL.md#3-presence); this spec only *consumes* presence to enrich lists and *triggers* the `friend.online` notification indirectly.
- **Notifications delivery** (`friend.invitation`, `friend.online`, `friend.room_started`) — owned by [notifications.spec.md](./notifications.spec.md); this spec only emits the *trigger*.
- **Direct messages** — [Social §5](../docs/SOCIAL.md#5-direct-messages) (a separate `dm.spec`).
- **The full block effect matrix** across DM/mentions/search/profile — [Social §7.2](../docs/SOCIAL.md#72-effect-matrix-the-one-enforcement-helper); this spec owns only friendship/request cascades.
- **Activity feed** generation — [Social §4](../docs/SOCIAL.md#4-activity-feed).
- **User search / discovery** — [discovery.spec.md](./discovery.spec.md) (calls the shared `filterVisibleUsers` helper this domain co-owns).
- **Group friendships / "close friends" tiers / friend nicknames** — deferred (see [§10 Open Questions](#10-open-questions)).

---

## 3. Functional Requirements

IDs are stable for traceability into [§7 tasks](#7-implementation-tasks), [§8 tests](#8-test-plan), and [§9 acceptance criteria](#9-acceptance-criteria).

### 3.1 Friend requests

- **FR-FRQ-1** A registered user MAY send a friend request to another user by `userId`, with an optional length-capped `message` (≤ 280 chars, validated, sanitized). Endpoint `POST /api/v1/friends/requests`.
- **FR-FRQ-2** Send precheck (all server-enforced, in order): (a) `addresseeId ≠ requesterId` else `CANNOT_FRIEND_SELF`; (b) no `Block` in **either** direction else `BLOCKED_RELATION`; (c) no existing `Friendship` else `ALREADY_FRIENDS`; (d) no live pending request in the **same** direction (idempotent no-op returning the existing request); (e) addressee `friendRequestPolicy` permits the requester (§3.5) else `FRIEND_REQUESTS_BLOCKED_BY_PRIVACY`.
- **FR-FRQ-3** **Auto-accept:** if a **reverse** `pending` request exists at send time, the operation instead resolves both directed requests and creates one `Friendship` atomically (no second pending row is created).
- **FR-FRQ-4** The addressee MAY **accept** (`POST /api/v1/friends/requests/:requestId/accept`) — actor must be the addressee, status must be `pending`, and no block may exist at accept time; on success a canonical-pair `Friendship` is created and the request flips to `accepted` in **one logical operation** under one `correlationId`.
- **FR-FRQ-5** The addressee MAY **decline** (`POST /api/v1/friends/requests/:requestId/decline`); status → `declined`; **no** notification to the requester by default (anti decline-shaming; configurable per [OQ-4](../docs/SOCIAL.md#10-open-questions)).
- **FR-FRQ-6** The requester MAY **cancel** an outgoing pending request (`DELETE /api/v1/friends/requests/:requestId`); status → `cancelled`; the addressee's pending `friend.invitation` notification is revoked.
- **FR-FRQ-7** A pending request **expires** to `expired` when `now > expiresAt` (default `now + 30 days`), via a periodic sweep job; the addressee's stale notification is cleaned.
- **FR-FRQ-8** Terminal states (`accepted`, `declined`, `cancelled`, `expired`) are **immutable**. A subsequent re-add is a **new** `FriendRequest` row, subject to the full precheck.
- **FR-FRQ-9** Listing: `GET /api/v1/me/friends/requests?direction=incoming|outgoing` returns pending requests, newest first, cursor-paginated, each enriched with the counterparty `UserCard`.

### 3.2 Friendships

- **FR-FSH-1** A `Friendship` is stored **once per unordered pair** with the invariant `userIdA < userIdB` (lexicographic ObjectId order) and `userIdA ≠ userIdB`; a unique index `(userIdA, userIdB)` enforces at-most-one.
- **FR-FSH-2** `GET /api/v1/me/friends` returns the caller's accepted friends, cursor-paginated, presence-enriched (status + activity per [presence visibility](../docs/SOCIAL.md#83-privacy-enforcement-points)), sortable by `online-first` (default) or `name`.
- **FR-FSH-3** "Friends of `U`" is computed by unioning `{ userIdB : userIdA = U }` ∪ `{ userIdA : userIdB = U }` (queryable from either side via the `(userIdA)` and `(userIdB)` indexes).
- **FR-FSH-4** **Unfriend** (`DELETE /api/v1/friends/:userId`) deletes the `Friendship` row directly (not a request transition); actor must be a party to the friendship; emits `social:friend:remove` to **both** parties' self-topics; leaves no terminal request record.
- **FR-FSH-5** **Mutual-friends count** between viewer `V` and target `T` = `|friends(V) ∩ friends(T)|`, computed server-side, exposed on full profile reads (`UserCard.mutualFriendCount`) subject to the target's `profileVisibility`.

### 3.3 Block interaction (friend-graph slice)

- **FR-BLK-1** Creating a `Block` (via the block surface) MUST, under one `correlationId`, atomically: dissolve any `Friendship` for the pair (emit `social:friend:remove` to both) **and** force any `pending` `FriendRequest` in **either** direction to `cancelled`.
- **FR-BLK-2** A `Block` in either direction makes FR-FRQ-2(b) reject all future sends with `BLOCKED_RELATION`, symmetrically.
- **FR-BLK-3** **Unblock** does **not** auto-restore a dissolved friendship; the users must re-request (a fresh `pending`).
- **FR-BLK-4** Block existence is **never** revealed to the blocked user; friend-graph operations against a blocker degrade as generic `BLOCKED_RELATION` without disclosing direction.

### 3.4 Realtime delivery

- **FR-RT-1** Every friend-graph mutation that affects another user fans out a `social:friend:*` frame to the affected self-topic(s) (`user:<id>`), wrapped in the canon [`RealtimeEnvelope`](../context/architecture.md#5-realtime-transport-abstraction-adr-004) (`v:1`, ULID `id`, `corr`).
- **FR-RT-2** Multi-device consistency: a mutation by one of the actor's sessions is mirrored to the actor's **other** sessions (e.g. `social:friend:remove` to own other devices) so all devices converge.
- **FR-RT-3** Realtime intents (`social:friend:request|accept|remove`, `social:block:add`) are **idempotent by envelope `id`** and re-validated server-side identically to the REST path (one service, two transports).

### 3.5 Privacy gating of requests

- **FR-PRV-1** Inbound requests are gated by the addressee's `friendRequestPolicy`: `everyone` (default) permits all non-blocked requesters; `friends_of_friends` permits only requesters sharing **≥ 1 mutual friend** with the addressee; `none` rejects all (`FRIEND_REQUESTS_BLOCKED_BY_PRIVACY`).
- **FR-PRV-2** A `Block` **always overrides** any "allow" policy (hard deny precedes privacy refinement).
- **FR-PRV-3** **Guests** (`User.kind = 'guest'`, canon §8) MAY NOT send or receive friend requests and have no durable friend graph; guest attempts return `FRIEND_REQUESTS_GUEST_FORBIDDEN`.

---

## 4. Data Model Touchpoints

> The Prisma schema (`packages/database/prisma/schema.prisma`) is the authoritative persisted shape (ADR-003); types below are illustrative vocabulary from [`packages/types`](../context/architecture.md#3-naming-conventions) and match [Social §2.1](../docs/SOCIAL.md#21-model-recap) verbatim. All ids are strings (canon §4).

### 4.1 Collections & shapes

```ts
// collection: friendships — one row per unordered pair
interface Friendship {
  id: string;
  userIdA: string;   // INVARIANT: userIdA < userIdB (lexicographic ObjectId order)
  userIdB: string;   // INVARIANT: userIdA !== userIdB
  createdAt: string; // = acceptance time (UTC ISO-8601)
  updatedAt: string;
}

type FriendRequestStatus =
  | 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';

// collection: friend_requests — directed, pending precursor
interface FriendRequest {
  id: string;
  requesterId: string;
  addresseeId: string;       // INVARIANT: addresseeId !== requesterId
  status: FriendRequestStatus;
  message: string | null;    // ≤ 280 chars, validated, sanitized
  respondedAt: string | null;
  expiresAt: string | null;  // default now + FRIEND_REQUEST_TTL (30d)
  createdAt: string;
  updatedAt: string;
}

// collection: blocks — directed (friend-graph slice only; full semantics in Social §7)
interface Block {
  id: string;
  blockerId: string;
  blockedId: string;         // INVARIANT: blockedId !== blockerId
  createdAt: string;
  updatedAt: string;
}
```

### 4.2 Indexes (canon §4 — equality → sort → range; FK on every query filter)

| Collection | Index | Type | Purpose |
|---|---|---|---|
| `friendships` | `(userIdA, userIdB)` | **unique** | one row per pair; existence checks |
| `friendships` | `(userIdA)` | secondary | list friends from the A side |
| `friendships` | `(userIdB)` | secondary | list friends from the B side |
| `friend_requests` | `(addresseeId, status, createdAt)` | compound | incoming pending list, newest first |
| `friend_requests` | `(requesterId, status, createdAt)` | compound | outgoing pending list |
| `friend_requests` | `(requesterId, addresseeId)` where `status='pending'` | **partial-unique** | ≤ 1 live request per directed pair |
| `friend_requests` | `(status, expiresAt)` | compound | expiry sweep scan |
| `blocks` | `(blockerId, blockedId)` | **unique** | the directed block edge |
| `blocks` | `(blockedId)` | secondary | "who blocked me?" predicate |

- **Timestamps:** every collection carries `createdAt @default(now())` + `updatedAt @updatedAt` (canon §4). No soft-delete on `friendships`/`friend_requests` — unfriend is a hard delete; request terminals are retained rows (audit), not deleted.
- **Denormalization:** none stored on these aggregates. `UserCard` identity fields (`displayName`, `avatarUrl`) are **resolved at emit/read time** from `User.profile` ([Social §9](../docs/SOCIAL.md#9-denormalization--fan-out)), never persisted onto the edge.

### 4.3 Invariants (must hold at all times)

- At most one `Friendship` per unordered pair; at most one live `pending` `FriendRequest` per directed pair; at most one `Block` per directed pair.
- `accepted` `FriendRequest` ⇒ a matching `Friendship` exists; deleting the `Friendship` (unfriend) does **not** reopen the request (it stays `accepted`, terminal).
- No `Friendship` and no `pending`/auto-accept may be created while a `Block` exists in either direction.

---

## 5. API & Event Surface

### 5.1 REST (canon §3 — versioned, plural, kebab, resource-nested)

| Method & path | Purpose | Guard | Success | Error codes |
|---|---|---|---|---|
| `GET /api/v1/me/friends` | List accepted friends (paginated, presence-enriched) | self | `{ data: UserCard[], meta }` | — |
| `GET /api/v1/me/friends/requests?direction=incoming\|outgoing` | List pending requests | self | `{ data: FriendRequestView[], meta }` | `VALIDATION_FAILED` |
| `POST /api/v1/friends/requests` | Send request `{ addresseeId, message? }` | not blocked; privacy (§3.5) | `201 FriendRequest` | `CANNOT_FRIEND_SELF`, `BLOCKED_RELATION`, `ALREADY_FRIENDS`, `FRIEND_REQUESTS_BLOCKED_BY_PRIVACY`, `FRIEND_REQUESTS_GUEST_FORBIDDEN`, `USER_NOT_FOUND` |
| `POST /api/v1/friends/requests/:requestId/accept` | Accept | actor is addressee | `200 Friendship` | `FRIEND_REQUEST_NOT_FOUND`, `FRIEND_REQUEST_NOT_PENDING`, `NOT_REQUEST_ADDRESSEE`, `BLOCKED_RELATION` |
| `POST /api/v1/friends/requests/:requestId/decline` | Decline | actor is addressee | `204` | `FRIEND_REQUEST_NOT_FOUND`, `FRIEND_REQUEST_NOT_PENDING`, `NOT_REQUEST_ADDRESSEE` |
| `DELETE /api/v1/friends/requests/:requestId` | Cancel outgoing | actor is requester | `204` | `FRIEND_REQUEST_NOT_FOUND`, `FRIEND_REQUEST_NOT_PENDING`, `NOT_REQUEST_REQUESTER` |
| `DELETE /api/v1/friends/:userId` | Unfriend | actor in friendship | `204` | `FRIENDSHIP_NOT_FOUND` |

All inputs validated via `class-validator` DTOs (`CreateFriendRequestDto`, suffix `Dto`, in `packages/types`). All non-2xx use the [standard error envelope](../context/architecture.md#10-cross-cutting-non-negotiables) with stable SCREAMING_SNAKE `code`, `correlationId` (ULID), `timestamp`. Collections use cursor pagination with `{ data, meta: { nextCursor } }`.

### 5.2 Realtime events (canon §3 — `social` namespace; full catalog in [Events §5.8](../docs/EVENTS.md#58-social-social))

| Event | Direction | Ack | Payload (`data`) | Recipients |
|---|---|---|---|---|
| `social:friend:request` | C→S | ack | `{ toUserId, message? }` | — (intent) |
| `social:friend:request` | S→C | n/a | `{ requestId, requester: UserCard }` | addressee self-topic |
| `social:friend:accept` | C→S | ack | `{ requestId }` | — (intent) |
| `social:friend:accept` | S→C | n/a | `{ friendshipId, friend: UserCard }` | both parties' self-topics |
| `social:friend:decline` | S→C | n/a | `{ requestId }` | requester (only if enabled) |
| `social:friend:cancel` | S→C | n/a | `{ requestId }` | addressee |
| `social:friend:remove` | C→S | ack | `{ friendUserId }` | — (intent) |
| `social:friend:remove` | S→C | n/a | `{ userId }` | both ex-friends (incl. actor's other sessions) |
| `social:block:add` | C→S | ack | `{ userId }` | — (intent; no event to blocked user) |

`UserCard` is the safe public projection ([Social §8.2](../docs/SOCIAL.md#82-public-projection-usercard)); `presence` within it is `null` when the viewer is not allowed to see it. Realtime errors use `system:error` with the same SCREAMING_SNAKE codes, `corr`-tied ([Events §5.12](../docs/EVENTS.md#512-error-payload)).

### 5.3 Error code vocabulary (this feature)

`CANNOT_FRIEND_SELF`, `BLOCKED_RELATION`, `ALREADY_FRIENDS`, `FRIEND_REQUEST_NOT_FOUND`, `FRIEND_REQUEST_NOT_PENDING`, `NOT_REQUEST_ADDRESSEE`, `NOT_REQUEST_REQUESTER`, `FRIEND_REQUESTS_BLOCKED_BY_PRIVACY`, `FRIEND_REQUESTS_GUEST_FORBIDDEN`, `FRIENDSHIP_NOT_FOUND`, `USER_NOT_FOUND`.

---

## 6. Permissions / Privacy

| Concern | Rule | Enforced at |
|---|---|---|
| **Who may send a request** | non-blocked + `friendRequestPolicy` (`everyone`/`friends_of_friends`/`none`); `friends_of_friends` needs ≥ 1 mutual | send precheck (§3.2/§3.5) |
| **Who may accept/decline** | the addressee only | `accept`/`decline` guards |
| **Who may cancel** | the requester only | `cancel` guard |
| **Who may unfriend** | either party | `unfriend` guard |
| **Block precedence** | a `Block` is a hard deny that overrides any allow | every send/accept |
| **Guests** | no friend graph; cannot send/receive | precheck (FR-PRV-3) |
| **Presence in lists** | gated by target's `presenceVisibility`; `null` if hidden | list enrichment |
| **Mutual count visibility** | gated by `profileVisibility` | profile read |
| **Block disclosure** | never revealed to the blocked party | error mapping (FR-BLK-4) |

Privacy and block predicates are evaluated **server-side at read/delivery time** via the shared `packages/social` helpers (`isBlockedBetween`, `canSendFriendRequest`, `filterVisibleUsers`) so policy lives in one place (canon §3, DRY). Clients render optimistically but hold **no** authority (canon §10).

---

## 7. Implementation Tasks

> These seed [tasks/friends.md](../tasks/friends.md); each is independently testable and traces to FR-/AC- ids. **No app code begins until tasks + tests exist (R5).**

1. **T-FRQ-Schema** — Add `friendships`, `friend_requests`, `blocks` models to the Prisma schema with `@@map` snake_case names and the [§4.2 indexes](#42-indexes-canon-4--equality--sort--range-fk-on-every-query-filter); generate the client. *(FR-FSH-1, FR-FRQ-1)*
2. **T-FRQ-Types** — Define `Friendship`, `FriendRequest`, `Block`, `FriendRequestStatus`, `CreateFriendRequestDto`, `FriendRequestView`, and reuse `UserCard` in `packages/types`. *(FR-FRQ-1, FR-FSH-2)*
3. **T-FRQ-Helpers** — In `packages/social`: `canonicalPair(a,b)`, `isBlockedBetween(a,b)`, `canSendFriendRequest(requester, addressee)`, `mutualFriendCount(a,b)`. *(FR-FSH-3, FR-FSH-5, FR-PRV-1)*
4. **T-FRQ-Service** — `FriendsService` implementing the [state machine](../docs/SOCIAL.md#22-friend-request-state-machine): send (+precheck +auto-accept), accept (atomic friendship+flip), decline, cancel, unfriend, list. *(FR-FRQ-1..9, FR-FSH-1..5)*
5. **T-FRQ-Atomic** — Implement accept/auto-accept as one logical operation with idempotency under double-submit (rely on unique partial index + unique pair index). *(FR-FRQ-3, FR-FRQ-4)*
6. **T-FRQ-Controller** — `FriendsController` exposing the [§5.1 REST surface](#51-rest-canon-3--versioned-plural-kebab-resource-nested) with `class-validator` DTOs + standard error envelope. *(§5.1)*
7. **T-FRQ-Gateway** — Register `social:friend:*` + `social:block:add` handlers in the realtime gateway (via `RealtimeModule`), sharing the service; idempotent by envelope `id`. *(FR-RT-1..3)*
8. **T-FRQ-BlockCascade** — Implement the friend-graph slice of the block cascade (dissolve friendship, cancel pending both directions) under one `correlationId`. *(FR-BLK-1..4)*
9. **T-FRQ-Presence** — Enrich friends list with presence via the [presence](../docs/SOCIAL.md#3-presence) read API, honoring `presenceVisibility` + block. *(FR-FSH-2)*
10. **T-FRQ-Notify** — Emit notification triggers (`friend.invitation` on send, accept ack) to the [Notifications builder](./notifications.spec.md); never build notifications inline. *(FR-FRQ-1, FR-FRQ-4)*
11. **T-FRQ-Sweep** — Expiry sweep job marking `pending → expired` past `expiresAt` and cleaning stale notifications. *(FR-FRQ-7)*
12. **T-FRQ-Privacy** — Wire `friendRequestPolicy` + guest gate into the send precheck. *(FR-PRV-1..3)*
13. **T-FRQ-Tests** — Unit + integration + e2e per [§8](#8-test-plan) to ≥ 90% coverage. *(all)*
14. **T-FRQ-Docs** — Update [docs/SOCIAL.md](../docs/SOCIAL.md) cross-refs, [docs/API.md](../docs/API.md) route table, and write [docs/FRIENDS.md](../docs/FRIENDS.md) user-facing notes; then history + context + repomix + project-state (R3/R4). *(§ Documentation)*

---

## 8. Test Plan

Coverage target **90%** (canon §10). Layers: unit (service + helpers), integration (Prisma against a Mongo test instance), e2e (REST + WS via supertest/ws), and concurrency.

### 8.1 Unit

- **State machine:** every transition and guard in the [table](../docs/SOCIAL.md#22-friend-request-state-machine) — happy paths and each rejection (`CANNOT_FRIEND_SELF`, `BLOCKED_RELATION`, `ALREADY_FRIENDS`, not-pending, not-addressee/requester).
- **Canonical pair:** `canonicalPair(a,b) === canonicalPair(b,a)` and always returns `userIdA < userIdB`.
- **Auto-accept:** reverse-pending send produces exactly one `Friendship` and zero new pending rows.
- **Privacy:** `friends_of_friends` allows iff mutual ≥ 1; `none` always rejects; block overrides allow.
- **Mutual count:** set-intersection correctness incl. empty and full overlap.

### 8.2 Integration (DB-backed)

- **Pair uniqueness:** concurrent double-accept / double-send creates ≤ 1 `Friendship` and ≤ 1 live pending (index-enforced) — assert the second attempt is a no-op returning the original.
- **Block cascade:** creating a block dissolves the friendship and cancels both-direction pending in one transaction; assert emitted events + final states.
- **Unfriend:** deletes the row, leaves `accepted` request terminal, re-add creates a fresh `pending`.
- **Expiry sweep:** rows past `expiresAt` flip to `expired`; non-expired untouched.

### 8.3 e2e (REST + realtime)

- Full lifecycle over REST: send → addressee receives `social:friend:request` on self-topic → accept → both receive `social:friend:accept` → unfriend → both receive `social:friend:remove`.
- **Idempotency:** retrying `social:friend:request` with the same envelope `id` yields one request and one ack with the original result.
- **Multi-device:** actor's second session receives `social:friend:remove` after unfriending from the first.
- **Error envelope conformance:** each error path returns the canon envelope with correct `code` + `correlationId`; the realtime twin returns `system:error` with the same `code`, `corr`-tied.
- **Guest forbidden:** a guest-kind token is rejected on send/accept with `FRIEND_REQUESTS_GUEST_FORBIDDEN`.

### 8.4 Negative / security

- Block existence is never disclosed (blocked party sees only `BLOCKED_RELATION`, no direction).
- Rate limiting on `POST /friends/requests` and `social:*` (anti-spam, canon §10 / Events §10) — burst exhaustion returns `RATE_LIMITED` and drops, connection survives.
- Authorization: a third party cannot accept/decline/cancel a request they are not party to.

---

## 9. Acceptance Criteria

Testable and numbered; each maps to FR-/test ids. The feature is **done** when all pass at ≥ 90% coverage.

1. **AC-FRQ-1 (Send + precheck)** A registered user can send a request to a non-blocked, policy-permitting, non-friend user; each precheck violation returns its exact code (`CANNOT_FRIEND_SELF`, `BLOCKED_RELATION`, `ALREADY_FRIENDS`, `FRIEND_REQUESTS_BLOCKED_BY_PRIVACY`). *(FR-FRQ-1/2, FR-PRV-1)*
2. **AC-FRQ-2 (Auto-accept)** Sending while a reverse `pending` exists creates exactly one `Friendship`, marks both directed requests resolved, emits `social:friend:accept` to both, and creates no second pending row. *(FR-FRQ-3)*
3. **AC-FRQ-3 (Atomic accept + idempotent)** Accepting creates the canonical-pair `Friendship` and flips the request to `accepted` in one operation; a concurrent/duplicate accept is a no-op returning the same result; at most one `Friendship` exists for the pair. *(FR-FRQ-4, FR-FSH-1)*
4. **AC-FRQ-4 (Decline/cancel)** Decline marks `declined` with no requester notification by default; cancel marks `cancelled` and revokes the addressee's pending notification; both reject if the actor is not the correct party. *(FR-FRQ-5/6)*
5. **AC-FRQ-5 (Expiry)** A pending request past `expiresAt` becomes `expired` via sweep and is excluded from incoming/outgoing lists; its stale notification is cleaned. *(FR-FRQ-7)*
6. **AC-FRQ-6 (Terminal immutability)** No terminal request can be mutated; a re-add after any terminal state creates a fresh `pending` subject to the full precheck. *(FR-FRQ-8)*
7. **AC-FSH-1 (Friends list)** `GET /me/friends` returns accepted friends, cursor-paginated, presence-enriched per visibility (`null` presence when hidden/blocked), online-first by default. *(FR-FSH-2)*
8. **AC-FSH-2 (Either-side query)** Friends are returned correctly whether the caller is the `userIdA` or `userIdB` side of each pair. *(FR-FSH-3)*
9. **AC-FSH-3 (Unfriend)** Unfriend hard-deletes the `Friendship`, emits `social:friend:remove` to both parties (and the actor's other sessions), and leaves the prior `accepted` request terminal. *(FR-FSH-4, FR-RT-2)*
10. **AC-FSH-4 (Mutual count)** Mutual-friends count equals the set-intersection size and is suppressed when `profileVisibility` forbids the viewer. *(FR-FSH-5)*
11. **AC-BLK-1 (Block cascade)** Creating a block dissolves any friendship (emitting `social:friend:remove` to both) and force-cancels pending requests in **both** directions, atomically under one `correlationId`; unblock restores nothing. *(FR-BLK-1/2/3)*
12. **AC-BLK-2 (Non-disclosure)** A blocked user attempting any friend-graph action receives only `BLOCKED_RELATION` with no indication of who blocked whom. *(FR-BLK-4)*
13. **AC-RT-1 (Envelope + parity)** Every `social:friend:*` frame is a valid `RealtimeEnvelope` (`v:1`, ULID `id`, `corr`); the realtime and REST paths produce identical state via one shared service; intents are idempotent by `id`. *(FR-RT-1/3)*
14. **AC-PRV-1 (Privacy + guest)** `friend_requests_blocked_by_privacy` and `friends_of_friends` (mutual ≥ 1) are enforced server-side; guests cannot participate (`FRIEND_REQUESTS_GUEST_FORBIDDEN`); block always overrides allow. *(FR-PRV-1..3)*
15. **AC-OBS-1 (Observability)** Every mutation carries one ULID `correlationId` propagated across REST → service → WS → notification trigger → logs; all errors use the canon envelope/codes; coverage ≥ 90%. *(canon §10)*

---

## 10. Open Questions

| # | Question | Recommendation | Process |
|---|---|---|---|
| **OQ-F1** | Does declining notify the requester? | **No by default** (anti decline-shaming); expose as a privacy-respecting opt-in. Mirrors [Social OQ-4](../docs/SOCIAL.md#10-open-questions). | Confirm with Chief Architect; toggle in `NotificationPrefs`. |
| **OQ-F2** | Friend nicknames / "close friends" tiers? | **Defer to v2.** Not required by SPEC; would add a per-edge embedded VO. | New spec + ADR if pursued. |
| **OQ-F3** | Should `friends_of_friends` consider 2-hop or only direct mutuals? | **Direct mutuals only** (≥ 1 shared accepted friend) for v1 — bounded query cost. | Lock here; revisit if abused. |
| **OQ-F4** | Cap on outgoing pending requests (anti-spam)? | **Yes — soft cap** (e.g. 100 live outgoing) returning `TOO_MANY_PENDING_REQUESTS`; tune with metrics. | Set constant in tasks; rate-limit covers burst. |
| **OQ-F5** | Re-add cooldown after a decline (anti-harassment)? | **Recommend a short cooldown** (e.g. 24 h) before re-requesting a decliner; gate behind privacy. | Confirm with Social + product. |

> OQ-F4/OQ-F5 add behavior but no new aggregate boundary, so they stay within this spec; any new collection or notification type requires the R3/R4 process (ADR + history + context + repomix).

---

## 11. Documentation Requirements

- **Spec → docs:** on implementation, update [docs/SOCIAL.md](../docs/SOCIAL.md) cross-references and the [docs/API.md](../docs/API.md) route + error tables to include the friends surface; author a concise user-facing [docs/FRIENDS.md](../docs/FRIENDS.md) (how requests/auto-accept/unfriend/block-interaction behave).
- **Types:** all friend types/DTOs land in `packages/types`; shared predicates in `packages/social` — never duplicated (canon §3).
- **Events:** confirm the `social:friend:*` rows in [docs/EVENTS.md §5.8](../docs/EVENTS.md#58-social-social) match this spec verbatim (event names, payloads, directions).
- **Process (R3/R4/R5):** spec (this file) → [tasks/friends.md](../tasks/friends.md) → tests → docs → (ADR only if an aggregate/collection/notification-type changes) → implement → test → history entry → context update → repomix → project-state.

---

*This specification is downstream of and bound by the [Cowatch Architecture Canon](../context/architecture.md) and the [Social System Architecture](../docs/SOCIAL.md). Any change to a friend aggregate boundary, the request state machine, the block cascade, or the canonical collection/event set requires an ADR + history entry + context update + repomix update (canon §10, R3/R4).*
