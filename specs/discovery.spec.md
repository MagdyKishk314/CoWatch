# Discovery & Search Feature Specification

> One-line purpose: The R5 specification for Cowatch's discovery and search surfaces — browsing public/active rooms (name, current video, viewer count, tags, NSFW flag, friends inside), trending rooms, popular tags, and unified search across users, friends, rooms, messages, videos, and tags — built entirely on canon denormalized read-hot snapshots with server-enforced privacy and block filtering.

- **Status:** Draft (Planning, Phase 7 — Discovery) — code-blocked until this spec + tasks + tests + docs exist (R5)
- **Owner agent:** Social / Voice Engineer
- **Last updated: 2026-06-27**

**Canon & cross-links**

- [Architecture Canon](../context/architecture.md) — single source of truth ([§1 Glossary](../context/architecture.md#1-glossary-of-core-domain-terms), [§3 Naming](../context/architecture.md#3-naming-conventions), [§4 Data Modeling](../context/architecture.md#4-data-modeling-conventions-mongodb--prisma), [§6 Permissions](../context/architecture.md#6-permission-model), [§10 Non-Negotiables](../context/architecture.md#10-cross-cutting-non-negotiables))
- Design docs: [Domain Model §3.10 Discovery & Search](../docs/DOMAIN.md), [API §discovery](../docs/API.md), [Social §8.4 Search interaction](../docs/SOCIAL.md#84-search-interaction-discovery-boundary), [§7 Blocks](../docs/SOCIAL.md#7-blocked-users-semantics) · [PRD §4.6 Discovery & Search](../docs/PRD.md)
- ADRs: [ADR-003 Prisma/MongoDB](../adr/ADR-003-prisma.md) · [ADR-004 Realtime abstraction](../adr/ADR-004-realtime.md) · [ADR-008 Auth tokens](../adr/ADR-008-auth.md)
- Sibling specs: [friends.spec.md](./friends.spec.md) · [notifications.spec.md](./notifications.spec.md) · [voice.spec.md](./voice.spec.md)
- Implementation tasks (planned): [tasks/discovery.md](../tasks/discovery.md)

> **Conflict rule.** On any discrepancy this spec yields to the [canon](../context/architecture.md) and the [Domain Model](../docs/DOMAIN.md). Discovery is a **read-only projection layer** over aggregates owned by other modules; it never owns a write to `rooms`, `users`, `messages`, or `queue_items`.

Owning NestJS module: **`DiscoveryModule`** (`apps/server/src/modules/discovery/`). It reads denormalized `rooms` fields and delegates user/friend filtering to **`packages/social`** (`filterVisibleUsers`). Canonical types in `packages/types`. It uses the `search` rate bucket (60/min, [API §rate limits](../docs/API.md)).

---

## 1. Overview & User Value

Discovery is the **growth surface**: it answers "what's being watched right now, who's there, and what's popular?" for a user who has no specific room in mind. Search is the **find surface**: it answers "where is the user/room/message/video/tag I'm looking for?".

**Persona:** "The Explorer" — browses active public rooms by interest/tags, sees which friends are inside, and joins a trending room; or searches a creator's handle, a movie title, or a tag. **Value metric:** % of room joins originating from browse/search (vs. invite/friend signal) — a direct growth indicator ([PRD metrics](../docs/PRD.md)).

The defining engineering constraint: discovery and search read **only canon denormalized snapshots** (`Room.viewerCount`, `Room.currentVideoTitle`, `Room.ownerDisplayName`, `tags`, `nsfw`) so hot list paths never fan out joins (canon §4, [NFR-SCALE](../docs/PRD.md)). These snapshots are **eventually consistent and never authoritative** for permission or sync decisions.

---

## 2. Scope

### 2.1 In scope

- **Room browse** (`GET /api/v1/discovery/rooms`): public/active rooms with name, current video title, viewer count, tags, NSFW flag, and **friends inside**; filter by tags + NSFW; sort by viewer count / recency / trending.
- **Trending rooms** (`GET /api/v1/discovery/rooms/trending`): ranked by a trending score over active rooms.
- **Popular tags** (`GET /api/v1/discovery/tags`): tag cloud / facets.
- **Unified search** (`GET /api/v1/search`): scopes `users | friends | rooms | messages | videos | tags`, each privacy/visibility/block-filtered.
- **NSFW gating** (per-user preference + per-result flag) and **visibility gating** (public listed; password listed-but-locked; private never appears).
- **Block & privacy filtering** of user/friend results via the shared `packages/social` helper.
- Cursor pagination on every list; offset only where a page-jump is explicitly needed (not v1, [API OQ](../docs/API.md)).

### 2.2 Out of scope (owned elsewhere)

- **Room CRUD, membership, join/password/invite** — Rooms domain (`RoomsModule`); discovery only *links to* join.
- **The denormalization writes** that maintain `viewerCount`/`currentVideoTitle` — owned by the source aggregates ([Domain §7](../docs/DOMAIN.md)); discovery only **reads** them.
- **Friendship/block/privacy semantics** — [friends.spec.md](./friends.spec.md) + [Social §7/§8](../docs/SOCIAL.md#7-blocked-users-semantics); discovery **consumes** the shared predicates.
- **Message content & read authorization** — Chat domain; message search returns only messages in channels the caller can read.
- **Personalized recommendations / ML ranking / full-text relevance tuning** — deferred (see [§10 Open Questions](#10-open-questions)); v1 trending is a deterministic score.
- **Realtime push of discovery deltas** — v1 is request/response; live viewer counts refresh on poll or on re-fetch (no discovery realtime namespace).

---

## 3. Functional Requirements

### 3.1 Room browse

- **FR-DSC-1** `GET /api/v1/discovery/rooms` returns rooms where `visibility ∈ {public, password}` AND the room is active (`status ∈ {active, idle}`, modeled via the canon `(visibility, isActive)` index). **Private rooms never appear.**
- **FR-DSC-2** Each result item exposes denorm snapshots only: `id`, `name`, `currentVideoTitle`, `viewerCount`, `tags`, `nsfw`, `visibility`, `ownerDisplayName`, and `friendsInside`.
- **FR-DSC-3** **`friendsInside`** is computed **per-caller**: the set of the caller's accepted friends (minus blocks) currently in the room, capped to a small preview (e.g. first 3 + count). It requires a registered account; it is **empty for guests**.
- **FR-DSC-4** Filters: `filter[tags]` (multikey match, AND/OR per [OQ-D3](#10-open-questions)), `filter[nsfw]` (see §3.4). Sort: `-viewerCount` (default), `-createdAt`, `-trendingScore`.
- **FR-DSC-5** Password rooms appear **listed but locked**: shown with name/video/tags/viewer count, but joining requires the password (enforced by the Rooms join path, not discovery).
- **FR-DSC-6** Pagination is cursor-based (keyset over the sort key + `id` tiebreaker); response is `{ data, meta: { nextCursor } }`.

### 3.2 Trending & tags

- **FR-TRD-1** `GET /api/v1/discovery/rooms/trending` ranks active public/password rooms by a deterministic **trending score** (§3.5), cursor-paginated; private/inactive excluded.
- **FR-TAG-1** `GET /api/v1/discovery/tags` returns popular tags with counts (facet aggregation over active public/password rooms' `tags`), NSFW tags filtered per the caller's preference.

### 3.3 Unified search

- **FR-SCH-1** `GET /api/v1/search?q=&scope=&limit=` accepts `q` (free text, validated, length-bounded) and `scope` (comma list of `users|friends|rooms|messages|videos|tags`; omit ⇒ all eligible scopes).
- **FR-SCH-2** Per-scope behavior:

| Scope | Source | Filter rules |
|---|---|---|
| `users` | `users` (handle/name) | `searchableByHandle` true; block-filtered (`filterVisibleUsers`); `profileVisibility` respected; returns `UserCard` |
| `friends` | caller's friends | block-filtered; registered-only (empty for guests) |
| `rooms` | `rooms` (name/tags/currentVideoTitle text index) | visibility-filtered (no private); NSFW-gated |
| `messages` | `messages` text | **only** messages in channels the caller can read (room membership or DM participation); block-filtered |
| `videos` | `queue_items` (title/provider) within readable rooms | scoped to rooms the caller can see/read |
| `tags` | `rooms.tags` | visibility-filtered; NSFW-gated |

- **FR-SCH-3** Results are returned per-scope (`{ users:[], rooms:[], videos:[], ... }`) with per-scope limits; each scope is independently paginable.
- **FR-SCH-4** **Blocked users are excluded** from `users`/`friends` results in both directions; a blocked user cannot find the blocker via handle search ([Social §7.2](../docs/SOCIAL.md#72-effect-matrix-the-one-enforcement-helper)).
- **FR-SCH-5** Search uses the `search` rate bucket (60/min per user, [API §rate limits](../docs/API.md)); exceeding returns `RATE_LIMITED`.

### 3.4 NSFW gating

- **FR-NSFW-1** Each room carries a denorm `nsfw` boolean ([Domain §3 RoomSettings](../docs/DOMAIN.md)). The caller has an NSFW preference (`showNsfw`, default **false** for guests / new accounts).
- **FR-NSFW-2** When `showNsfw=false`, NSFW rooms and NSFW-dominant tags are excluded from browse/trending/tags/search by default; an explicit `filter[nsfw]=true` is honored **only** if the caller's preference permits it (server-enforced; client cannot bypass).
- **FR-NSFW-3** Guests cannot enable NSFW (most-restrictive default, canon §8); the preference is ignored/forced false for guest tokens.

### 3.5 Trending score (deterministic v1)

- **FR-RANK-1** Trending score is a deterministic, explainable function of denorm signals only — recommended `score = viewerCount * w_v + recentJoinRate * w_r * decay(ageMinutes)` — computed server-side; **no** ML, no per-user personalization in v1.
- **FR-RANK-2** The score reads only eventually-consistent denorm fields and is recomputed on read (or cached briefly); it is **never** treated as authoritative for membership or sync (canon §4, [Domain R6](../docs/DOMAIN.md)).

### 3.6 Consistency & freshness

- **FR-CON-1** Viewer counts and current video titles are **eventually consistent** denorm snapshots; discovery accepts staleness within the reconciliation window and never blocks on a live count.
- **FR-CON-2** Discovery performs **no writes** to source aggregates; it is a pure read projection. A stale `friendsInside`/`viewerCount` is acceptable and self-heals on the next snapshot fan ([Domain §7](../docs/DOMAIN.md)).

---

## 4. Data Model Touchpoints

> Discovery owns **no** collection. It reads denorm fields the source aggregates maintain (canon §4). Authoritative shapes live in the Prisma schema; the fields below are the read contract.

### 4.1 Read-from fields (denorm snapshots; sources owned elsewhere)

| Field | Lives on | Source of truth | Refreshed on |
|---|---|---|---|
| `viewerCount` | `Room` | `count(active Membership)` | join/leave events |
| `currentVideoTitle` | `Room` | playing `QueueItem.title` | playback advance |
| `ownerDisplayName` | `Room` | `User.displayName` | owner profile change / transfer |
| `tags` | `Room` (RoomSettings) | room settings | settings update |
| `nsfw` | `Room` (RoomSettings) | room settings | settings update |
| `visibility` / `isActive` | `Room` | room state | settings / activity change |

### 4.2 Indexes relied upon (defined by source domains, canon §4)

| Collection | Index | Discovery use |
|---|---|---|
| `rooms` | `(visibility, isActive)` **mandatory (canon §4)** | browse / trending base filter |
| `rooms` | `tags` multikey | tag filter + popular-tags facet |
| `rooms` | text index on `name` / `tags` / `currentVideoTitle` | room + tag search |
| `messages` | `(roomId, createdAt)` + text-eligible search index | message search (within readable channels) |
| `users` | handle/name search index (lowercased) | user search |
| `queue_items` | `(playlistId, position)` + title-eligible index | video search within readable rooms |
| `friendships` | `(userIdA)` / `(userIdB)` | `friendsInside` + `friends` scope |
| `blocks` | `(blockerId, blockedId)` / `(blockedId)` | block filtering |

- **No new indexes** are introduced by discovery in v1; if room search needs a richer relevance index that is an additive change tracked in [OQ-D1](#10-open-questions) (R3/R4 if it changes the schema).

### 4.3 Result projections (read-only, in `packages/types`)

```ts
interface DiscoveryRoomCard {
  id: string;
  name: string;
  currentVideoTitle: string | null;  // denorm
  viewerCount: number;               // denorm (advisory; never authoritative)
  tags: string[];
  nsfw: boolean;
  visibility: 'public' | 'password'; // private never surfaces
  ownerDisplayName: string;          // denorm
  friendsInside: { previews: UserCard[]; total: number }; // per-caller; empty for guests
  trendingScore?: number;            // present on trending responses
}

interface SearchResults {
  users?: UserCard[];
  friends?: UserCard[];
  rooms?: DiscoveryRoomCard[];
  messages?: { messageId: string; roomId?: string; threadId?: string; excerpt: string; createdAt: string }[];
  videos?: { queueItemId: string; roomId: string; title: string; provider: 'youtube'; providerId: string }[];
  tags?: { tag: string; count: number }[];
  meta: { perScopeCursors: Record<string, string | null> };
}
```

---

## 5. API & Event Surface

### 5.1 REST (canon §3)

| Method & path | Purpose | Auth | Notes |
|---|---|---|---|
| `GET /api/v1/discovery/rooms` | Browse public/active rooms | Bearer | `filter[tags]`, `filter[nsfw]`, `sort`, `cursor`, `limit`; `friendsInside` per-caller |
| `GET /api/v1/discovery/rooms/trending` | Trending rooms | Bearer | deterministic score (§3.5) |
| `GET /api/v1/discovery/tags` | Popular tags + counts | Bearer | NSFW-gated facets |
| `GET /api/v1/search` | Unified search | Bearer | `q`, `scope`, `limit`; per-scope filtered |

- Query parameters follow the canon API conventions ([API §query params](../docs/API.md)): `q` (free text), `filter[...]`, `sort` (with `-` for desc), `cursor`/`limit`. All validated via `class-validator` DTOs.
- Success is the bare/collection envelope `{ data, meta }` (canon §10); non-2xx use the [standard error envelope](../context/architecture.md#10-cross-cutting-non-negotiables) with stable SCREAMING_SNAKE `code` + `correlationId`.
- **Guests** may browse/search public surfaces but get `friendsInside=[]`, no `friends` scope, and forced `nsfw=false`.

### 5.2 Realtime

- **No discovery realtime namespace** in v1 (canon §3 fixes eight namespaces; `discovery` is **not** one). Live viewer counts are reflected only when a client already holds a room topic subscription (via `room:*` / `playback:sync` it gets after joining), or on the next browse fetch. Adding any discovery realtime feed is an ADR-gated canon change ([OQ-D4](#10-open-questions)).

### 5.3 Error code vocabulary (this feature)

`VALIDATION_FAILED`, `RATE_LIMITED`, `NSFW_NOT_PERMITTED` (caller requested `filter[nsfw]=true` without permission), `SEARCH_SCOPE_INVALID`.

---

## 6. Permissions / Privacy

| Concern | Rule | Enforced at |
|---|---|---|
| **Room visibility** | only `public`/`password` listed; **private never appears** in any browse/search/tag/video result | base query filter (FR-DSC-1) |
| **Password rooms** | listed-but-locked; join still password-gated by Rooms | listing (FR-DSC-5) |
| **NSFW** | gated by caller preference + per-result flag; server-enforced; guests forced false | NSFW filter (FR-NSFW-1..3) |
| **User/friend results** | `filterVisibleUsers`: block + `searchableByHandle` + `profileVisibility` | `packages/social` helper (FR-SCH-4) |
| **Block symmetry** | blocked users excluded both ways; blocker invisible to blocked in search | block predicate |
| **Message search** | only channels the caller can read (membership/participation) | per-scope authz (FR-SCH-2) |
| **friendsInside** | only the caller's own non-blocked friends; registered-only | per-caller compute (FR-DSC-3) |
| **Projection safety** | return `UserCard`/card projections, never raw `User` or private room internals | every read |

All social filtering goes through the **single shared `packages/social` helper** (`filterVisibleUsers(viewerId, candidates)`) so discovery and search apply the **same** policy as the social surfaces (canon §3, DRY; [Social §8.4](../docs/SOCIAL.md#84-search-interaction-discovery-boundary)). Privacy/visibility/NSFW are **always server-enforced**, never client-trusted (canon §10, [NFR-SEC-6](../docs/PRD.md)).

---

## 7. Implementation Tasks

> Seeds [tasks/discovery.md](../tasks/discovery.md). No app code until tasks + tests exist (R5).

1. **T-DSC-Types** — `DiscoveryRoomCard`, `SearchResults`, scope enum, browse/trending/tags/search DTOs in `packages/types`. *(§4.3, §5)*
2. **T-DSC-Service** — `DiscoveryService.browseRooms(filters, sort, cursor)` reading the `(visibility, isActive)` index + denorm fields; cursor pagination. *(FR-DSC-1..6, FR-CON-1)*
3. **T-DSC-FriendsInside** — Per-caller `friendsInside` resolution (intersection of room's active members with caller's non-blocked friends, capped preview); registered-only, empty for guests. *(FR-DSC-3)*
4. **T-DSC-Trending** — Deterministic trending score over denorm signals + ranked endpoint. *(FR-TRD-1, FR-RANK-1/2)*
5. **T-DSC-Tags** — Popular-tags facet aggregation (NSFW-gated). *(FR-TAG-1)*
6. **T-DSC-Search** — `SearchService` with per-scope handlers (`users/friends/rooms/messages/videos/tags`), delegating user/friend filtering to `packages/social`, channel-read authz for messages/videos. *(FR-SCH-1..5)*
7. **T-DSC-NSFW** — NSFW preference plumbing + server-enforced gating across browse/trending/tags/search; guest force-false. *(FR-NSFW-1..3)*
8. **T-DSC-Controller** — `DiscoveryController` exposing the [§5.1 routes](#51-rest-canon-3) with `search` rate bucket + standard error envelope. *(§5)*
9. **T-DSC-SocialHelper** — Ensure/extend `filterVisibleUsers` in `packages/social` and reuse it (no duplicated filtering logic). *(FR-SCH-4, §6)*
10. **T-DSC-Tests** — Unit + integration + e2e per [§ Test Plan](#-test-plan) to ≥ 90%.
11. **T-DSC-Docs** — Update [docs/API.md](../docs/API.md) discovery/search tables + [docs/DOMAIN.md](../docs/DOMAIN.md) discovery section cross-refs; author [docs/DISCOVERY.md](../docs/DISCOVERY.md); then history + context + repomix + project-state.

---

## Test Plan

Coverage target **90%** (canon §10). Layers: unit (filters/ranking/projection), integration (Prisma + index usage), e2e (REST), and privacy/security.

### Unit

- **Visibility filter:** private rooms never appear in any scope; password rooms appear as locked cards.
- **NSFW gating:** `showNsfw=false` excludes NSFW rooms/tags; explicit `filter[nsfw]=true` honored only with permission, else `NSFW_NOT_PERMITTED`; guest forced false.
- **Trending score:** deterministic and monotonic in `viewerCount`/recency for fixed inputs; reproducible.
- **friendsInside:** intersection correctness; excludes blocked friends; empty for guests; preview cap respected.
- **Search scope parsing:** unknown scope → `SEARCH_SCOPE_INVALID`; omitted scope → all eligible.

### Integration (DB-backed)

- **Index usage:** browse/trending queries use `(visibility, isActive)`; tag filter uses the multikey index; room search uses the text index (assert via explain or query shape).
- **Cursor pagination:** stable keyset paging with no duplicates/gaps across pages under inserts.
- **Message/video authz:** message/video search returns only items in channels the caller can read; non-member sees none.
- **Denorm staleness tolerance:** a lagging `viewerCount` still returns a result (no join/block on live count).

### e2e (REST)

- Browse returns the correct card shape with per-caller `friendsInside`; password rooms locked; private absent.
- Unified search returns per-scope buckets with independent cursors; blocked users excluded both directions.
- Rate limit: exceeding the `search` bucket returns `RATE_LIMITED`; envelope conformance for all error codes.
- Guest path: no `friends` scope, empty `friendsInside`, NSFW forced false.

### Privacy / security

- A blocked user cannot find the blocker via `users` search and vice-versa.
- A private room and its members never leak via any discovery/search/tag/video result.
- `filter[nsfw]=true` from a guest or unpermitted user is rejected, not silently honored.

---

## Acceptance Criteria

Testable and numbered; the feature is **done** when all pass at ≥ 90% coverage.

1. **AC-DSC-1 (Browse contract)** `GET /discovery/rooms` returns active `public`/`password` rooms with `name`, `currentVideoTitle`, `viewerCount`, `tags`, `nsfw`, `ownerDisplayName`, and per-caller `friendsInside`; **private rooms never appear**; results page via stable cursors. *(FR-DSC-1..6)*
2. **AC-DSC-2 (friendsInside)** `friendsInside` contains only the caller's non-blocked accepted friends currently in the room (capped preview + total), is registered-only, and is empty for guests. *(FR-DSC-3)*
3. **AC-DSC-3 (Filters/sort)** Tag and NSFW filters and `-viewerCount`/`-createdAt`/`-trendingScore` sorts work and are server-enforced. *(FR-DSC-4)*
4. **AC-TRD-1 (Trending)** Trending ranks active non-private rooms by a deterministic, explainable score over denorm signals only; output is reproducible for fixed inputs and never used as authority. *(FR-TRD-1, FR-RANK-1/2)*
5. **AC-TAG-1 (Tags)** Popular tags return counts over active non-private rooms, NSFW-gated per caller. *(FR-TAG-1)*
6. **AC-SCH-1 (Unified search)** `GET /search` returns per-scope buckets for the requested (or all eligible) scopes with independent pagination; unknown scope → `SEARCH_SCOPE_INVALID`. *(FR-SCH-1..3)*
7. **AC-SCH-2 (Search authz)** `messages`/`videos` results are limited to channels/rooms the caller can read; `users`/`friends` are block- and `searchableByHandle`/`profileVisibility`-filtered via the shared helper. *(FR-SCH-2, FR-SCH-4)*
8. **AC-SCH-3 (Block symmetry)** Blocked users are excluded from search both directions; a blocked user cannot find the blocker. *(FR-SCH-4)*
9. **AC-NSFW-1 (NSFW gating)** NSFW content is hidden by default, surfaced only on explicit, permitted opt-in; guests cannot enable it (`NSFW_NOT_PERMITTED` / forced false). *(FR-NSFW-1..3)*
10. **AC-PERF-1 (Denorm-only reads)** Browse/trending/tags read **only** canon denorm snapshots (no per-room membership/playlist join on the list path) and use the `(visibility, isActive)` index. *(FR-CON-1/2, §4.2)*
11. **AC-CON-1 (Read-only/eventual)** Discovery performs no writes to source aggregates and tolerates eventually-consistent counts without blocking or erroring on staleness. *(FR-CON-1/2)*
12. **AC-OBS-1 (Observability)** Every request carries one ULID `correlationId`; the `search` rate bucket is enforced (`RATE_LIMITED`); all errors use the canon envelope/codes; coverage ≥ 90%. *(canon §10)*

---

## 10. Open Questions

| # | Question | Recommendation | Process |
|---|---|---|---|
| **OQ-D1** | Does room/message search need a dedicated full-text/relevance index beyond the canon text-eligible index? | **v1: use the canon text index** with simple match + denorm sort. Add a richer relevance index (e.g. Atlas Search) only if relevance complaints surface — additive, schema-touching ⇒ R3/R4. | ADR if it changes the schema/index set. |
| **OQ-D2** | Offset pagination for "jump to page N" on discovery? | **No for v1** — cursor-only; infinite scroll covers all current UIs. Mirrors [API OQ](../docs/API.md). | Revisit for an admin console. |
| **OQ-D3** | Tag filter semantics — AND vs OR across multiple tags? | **OR by default** (broader discovery), with an explicit `mode=all` for AND. Confirm with product. | Lock in tasks. |
| **OQ-D4** | Live discovery (realtime viewer-count/trending deltas)? | **Defer.** No `discovery` realtime namespace in v1 (canon fixes eight namespaces); poll/refetch is sufficient. A live feed needs a canon change. | ADR (R3) if pursued. |
| **OQ-D5** | Personalized ranking / "for you"? | **Defer to post-launch.** v1 trending is deterministic + non-personalized; personalization adds a recommender subsystem out of Phase 7 scope. | New spec + ADR. |
| **OQ-D6** | Should `videos` scope search across *all* providers or just YouTube (Phase 7 provider)? | **YouTube only** for v1 (canon media provider); generalize when more providers land. | Cross-ref Media spec. |

> No item above changes a canonical aggregate boundary; any new collection, index, or realtime namespace (OQ-D1/OQ-D4) requires the R3/R4 process before implementation.

---

## 8. Documentation Requirements

- **Spec → docs:** on implementation, reconcile the [docs/API.md](../docs/API.md) discovery/search route + query tables and the [docs/DOMAIN.md](../docs/DOMAIN.md) discovery section with this spec; author a user-facing [docs/DISCOVERY.md](../docs/DISCOVERY.md) (browse, trending, tags, search scopes, NSFW behavior).
- **Types:** all discovery/search projections + DTOs land in `packages/types`; the social filter stays in `packages/social` — never duplicated (canon §3).
- **Process (R3/R4/R5):** spec (this file) → [tasks/discovery.md](../tasks/discovery.md) → tests → docs → (ADR only if a new index/collection/realtime namespace is added) → implement → test → history → context → repomix → project-state.

---

*This specification is downstream of and bound by the [Cowatch Architecture Canon](../context/architecture.md) and the [Domain Model](../docs/DOMAIN.md). Discovery is a read-only projection layer; any new search index, collection, or realtime discovery namespace requires an ADR + history entry + context update + repomix update (canon §10, R3/R4).*
