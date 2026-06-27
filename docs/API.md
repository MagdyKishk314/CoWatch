# Cowatch REST API Contract

> Authoritative HTTP/REST contract for the Cowatch backend: global conventions (versioning, auth, error envelope, pagination, idempotency, rate limits) plus the full endpoint catalog grouped by domain.

**Status:** Draft (Planning — Phase 0: Architecture)
**Owner agent:** Backend Engineer
**Last updated: 2026-06-27**

> Canon compliance: this document conforms to the [Architecture Canon](../context/architecture.md). On any conflict, the canon wins. It cites verbatim from [§3 Naming Conventions](../context/architecture.md#3-naming-conventions) (route shapes), [§8 Auth/Token Model](../context/architecture.md#8-auth--token-model-adr-008), [§6 Permission Model](../context/architecture.md#6-permission-model), and [§10 Cross-Cutting Non-Negotiables](../context/architecture.md#10-cross-cutting-non-negotiables) (error envelope, versioning, observability).
>
> Realtime event contracts are a **separate document** (WebSocket envelope + `namespace:entity:action` events); this file covers REST only. Where a capability is realtime-first (playback mutations, typing, presence), the REST surface here is limited to snapshot reads and out-of-band actions, and is cross-linked to the realtime spec.

Related design docs: [AUTH.md](./AUTH.md) · [PERMISSIONS.md](./PERMISSIONS.md) · [SYNC.md](./SYNC.md) · [DOMAIN.md](./DOMAIN.md) · [LIVEKIT.md](./LIVEKIT.md) · [ARCHITECTURE.md](./ARCHITECTURE.md)

---

## Table of Contents

1. [Scope & Non-Goals](#1-scope--non-goals)
2. [Conventions](#2-conventions)
   - [2.1 Base Path & Versioning](#21-base-path--versioning)
   - [2.2 Authentication & Authorization](#22-authentication--authorization)
   - [2.3 Standard Error Envelope](#23-standard-error-envelope)
   - [2.4 Success Envelope](#24-success-envelope)
   - [2.5 Pagination](#25-pagination)
   - [2.6 Filtering, Sorting & Sparse Fields](#26-filtering-sorting--sparse-fields)
   - [2.7 Idempotency](#27-idempotency)
   - [2.8 Rate Limiting](#28-rate-limiting)
   - [2.9 Standard Headers](#29-standard-headers)
   - [2.10 Status Code Conventions](#210-status-code-conventions)
   - [2.11 Common Error Codes](#211-common-error-codes)
3. [Endpoint Catalog](#3-endpoint-catalog)
   - [3.1 Auth](#31-auth)
   - [3.2 Users & Profiles](#32-users--profiles)
   - [3.3 Friends & Friend Requests](#33-friends--friend-requests)
   - [3.4 Blocks](#34-blocks)
   - [3.5 Rooms](#35-rooms)
   - [3.6 Memberships & Roles](#36-memberships--roles)
   - [3.7 Playlist & Queue](#37-playlist--queue)
   - [3.8 Messages & DMs](#38-messages--dms)
   - [3.9 Notifications](#39-notifications)
   - [3.10 Discovery & Search](#310-discovery--search)
   - [3.11 Voice Tokens](#311-voice-tokens)
   - [3.12 Uploads](#312-uploads)
   - [3.13 Health & Meta](#313-health--meta)
4. [Permission Matrix → Endpoint Map](#4-permission-matrix--endpoint-map)
5. [Open Questions](#5-open-questions)

---

## 1. Scope & Non-Goals

**In scope:** every HTTP endpoint the `apps/server` NestJS REST controllers expose under `/api/v1`, the global request/response conventions, and the auth/permission requirement for each route.

**Out of scope (separate contracts):**

- Realtime events (`playback:*`, `chat:message:new`, `presence:update`, …) — owned by the realtime event contract. Mutating playback is **realtime-only** per [Canon §7](../context/architecture.md#7-sync-algorithm); REST only exposes the playback **snapshot read**.
- WebSocket handshake/auth — see [AUTH.md §18](./AUTH.md#18-realtime-auth-ws-handshake).
- Prisma data model — owned by `packages/database/prisma/schema.prisma` and [DOMAIN.md](./DOMAIN.md).
- TypeScript DTO/type source — owned by `packages/types`. JSON shapes below are illustrative projections of those types.

---

## 2. Conventions

### 2.1 Base Path & Versioning

| Aspect | Value |
|---|---|
| Base URL | `https://<host>/api/v1` |
| Versioning strategy | URI-versioned (`/api/v1`). Breaking change ⇒ `/api/v2`; old version deprecated per policy, never silently mutated ([Canon §10](../context/architecture.md#10-cross-cutting-non-negotiables)). |
| Resource style | Plural, kebab-case, resource-nested. Verbs never appear in paths. Non-CRUD sub-actions use a trailing action segment, e.g. `POST /rooms/:roomId/ownership/transfer`. |
| Content type | `application/json; charset=utf-8` for request and response bodies (except multipart upload init and binary PUT to MinIO). |
| Casing | JSON keys are `camelCase`. Path/query params are `camelCase`. |
| Time | All timestamps are UTC ISO-8601 strings (e.g. `2026-06-27T18:04:21.123Z`); durations/offsets are epoch ms integers. |
| IDs | Persistent entity ids are Mongo `ObjectId` rendered as 24-hex strings. Correlation/idempotency ids are ULID. |

All examples below omit the `/api/v1` prefix in tables for brevity; it is always present.

### 2.2 Authentication & Authorization

Per [Canon §8](../context/architecture.md#8-auth--token-model-adr-008) and [AUTH.md](./AUTH.md):

- **Access token** — JWT (RS256), 15-minute lifetime, sent as `Authorization: Bearer <jwt>`. Claims: `sub` (userId), `sid` (sessionId), `kind` (`registered`\|`guest`), `roles`, `iat`, `exp`. This is the auth mechanism for **all** application endpoints.
- **Refresh token** — opaque, rotating, 30-day, delivered as an **httpOnly, Secure, SameSite=Strict** cookie named `cw_rt`, scoped to path `/api/v1/auth`. Used **only** by `POST /auth/refresh` and `POST /auth/logout`. Never read by JS.
- **CSRF** — cookie-authenticated mutations (the `/auth/refresh` and `/auth/logout` family) require a double-submit CSRF token: header `x-csrf-token` must match the `cw_csrf` non-httpOnly cookie. Bearer-authenticated endpoints are CSRF-exempt (no ambient credentials).
- **Permission requirement notation** used in catalog tables:

| Notation | Meaning |
|---|---|
| `Public` | No authentication required. |
| `Bearer` | Any valid access token (registered or guest). |
| `Bearer (registered)` | Valid access token with `kind=registered` (guests rejected → `403 GUEST_FORBIDDEN`). |
| `Cookie+CSRF` | Refresh cookie + matching CSRF token (no Bearer). |
| `Member:<role>` | Caller must hold a room `Membership` with effective role ≥ the named `RoomRole` (`Owner` > `Moderator` > `Member` > `Guest`). Enforced by a Nest `RoomRoleGuard`. |
| `Self` | `sub` must equal the `:userId` path param (or own resource). |
| `2FA` | If the account has TOTP enabled, a step-up challenge token is required. |

Authorization failures return `401` (no/invalid token) vs `403` (valid token, insufficient permission). See [PERMISSIONS.md](./PERMISSIONS.md) for the room role model and [§4](#4-permission-matrix--endpoint-map).

### 2.3 Standard Error Envelope

Every non-2xx response uses the canonical envelope ([Canon §10](../context/architecture.md#10-cross-cutting-non-negotiables)):

```json
{
  "error": {
    "code": "ROOM_NOT_FOUND",
    "message": "No room exists with id 665f1c2a9b4e1a0012ab34cd.",
    "details": { "roomId": "665f1c2a9b4e1a0012ab34cd" },
    "correlationId": "01J9Z8K3M7Q2R5T8V1X4Y6B0CD",
    "timestamp": "2026-06-27T18:04:21.123Z"
  }
}
```

- `code` is a stable `SCREAMING_SNAKE_CASE` enum (see [§2.11](#211-common-error-codes)). Clients branch on `code`, never on `message`.
- `details` is an object; for validation failures it is `{ "fields": { "<path>": ["<rule>"] } }`.
- `correlationId` is the ULID echoed from/added to the `x-correlation-id` header; it ties REST + realtime + logs.
- `timestamp` is UTC ISO-8601.

### 2.4 Success Envelope

- **Single resource** — returned **bare** (no wrapper):

  ```json
  { "id": "665f1c2a9b4e1a0012ab34cd", "name": "Friday Movie Night", "visibility": "public" }
  ```

- **Collections** — wrapped with `data` + `meta`:

  ```json
  {
    "data": [ { "id": "…" }, { "id": "…" } ],
    "meta": { "nextCursor": "eyJjcmVhdGVkQXQiOiIyMDI2…", "hasMore": true, "limit": 25, "total": null }
  }
  ```

- `204 No Content` carries no body (revocations, deletes with nothing to return).

### 2.5 Pagination

Default strategy is **cursor (keyset) pagination**, suited to MongoDB and infinite-scroll surfaces (chat, feeds, notifications). Offset pagination is offered only for admin/discovery list views where a total/page jump is needed.

| Query param | Type | Default | Notes |
|---|---|---|---|
| `cursor` | string (opaque, base64url) | — | Encodes the sort-key tuple of the last item. Omit for first page. |
| `limit` | int | 25 | Min 1, max 100. |
| `direction` | `forward` \| `backward` | `forward` | `backward` paginates toward newer/older depending on the sort. |

Response `meta`:

```json
{ "nextCursor": "eyJ…", "prevCursor": "eyJ…", "hasMore": true, "limit": 25, "total": null }
```

- `total` is `null` for cursor endpoints (counting is O(n) on Mongo); it is an integer only on the few offset endpoints that opt in.
- Cursors are **opaque and tamper-evident**; a malformed/expired cursor → `400 INVALID_CURSOR`.

### 2.6 Filtering, Sorting & Sparse Fields

| Param | Example | Meaning |
|---|---|---|
| `sort` | `sort=-createdAt` | Comma list; `-` prefix = descending. Allow-listed per endpoint; unknown key → `400 INVALID_SORT`. |
| `q` | `q=movie` | Free-text search (discovery/search endpoints only). |
| `filter[<field>]` | `filter[visibility]=public` | Allow-listed equality/`in` filters. |
| `include` | `include=playlist,members` | Expand referenced sub-resources (bounded, allow-listed). |

### 2.7 Idempotency

All **unsafe, non-idempotent** mutations (`POST` that creates a resource or has side effects) accept an optional `Idempotency-Key` header (client-generated ULID, ≤ 64 chars).

- The server stores `(userId, route, Idempotency-Key) → first response` for **24 h**.
- A replay with the same key returns the original status + body and sets `Idempotency-Replayed: true`.
- Same key + **different** request body → `409 IDEMPOTENCY_KEY_REUSED`.
- `PUT`/`DELETE`/`PATCH` are idempotent by design and ignore the header.

**Required** (server rejects without it → `400 IDEMPOTENCY_KEY_REQUIRED`) on high-cost / double-submit-prone operations: `POST /rooms`, `POST /rooms/:roomId/playlist/items`, `POST /uploads`, `POST /auth/register`, `POST /messages` (room + DM send), `POST /friends/requests`.

```http
POST /api/v1/rooms HTTP/1.1
Authorization: Bearer <jwt>
Idempotency-Key: 01J9Z8K3M7Q2R5T8V1X4Y6B0CD
Content-Type: application/json
```

### 2.8 Rate Limiting

Per-IP **and** per-user (`sub`) sliding-window limits ([Canon §10](../context/architecture.md#10-cross-cutting-non-negotiables)). Buckets:

| Bucket | Scope | Limit (default) | Endpoints |
|---|---|---|---|
| `auth-strict` | per IP + per email | 10 / 15 min | login, register, refresh, password-reset, 2FA verify |
| `write` | per user | 120 / min | all mutating app endpoints |
| `read` | per user | 600 / min | all safe reads |
| `search` | per user | 60 / min | discovery + search |
| `upload-init` | per user | 30 / hour | `POST /uploads` |
| `message-send` | per user + per channel | 20 / 10 s | room + DM message send (anti-spam) |

Every response carries rate-limit headers; `429` adds `Retry-After`:

```http
RateLimit-Limit: 120
RateLimit-Remaining: 117
RateLimit-Reset: 41          ; seconds until window reset
Retry-After: 41              ; only on 429
```

`429` body uses the standard envelope with `code: "RATE_LIMITED"` and `details.bucket`.

### 2.9 Standard Headers

**Request**

| Header | Required | Purpose |
|---|---|---|
| `Authorization: Bearer <jwt>` | for `Bearer*` routes | Access token. |
| `x-correlation-id` | optional | ULID; generated by server if absent, echoed in response + logs. |
| `Idempotency-Key` | per [§2.7](#27-idempotency) | Dedupe unsafe POSTs. |
| `x-csrf-token` | for `Cookie+CSRF` routes | Double-submit CSRF value. |
| `If-None-Match` | optional | Conditional GET against `ETag`. |
| `Accept-Language` | optional | Localization hint (server stores UTC; client localizes). |

**Response**

| Header | Purpose |
|---|---|
| `x-correlation-id` | ULID for the operation. |
| `ETag` | On cacheable single-resource GETs (profiles, rooms). |
| `RateLimit-*` | See [§2.8](#28-rate-limiting). |
| `Idempotency-Replayed` | `true` when a stored idempotent response is replayed. |
| `Location` | On `201 Created`, the canonical URL of the new resource. |

CORS is a strict allowlist (web + desktop + landing origins); `credentials` allowed for the cookie-scoped auth origin only.

### 2.10 Status Code Conventions

| Code | Used for |
|---|---|
| `200 OK` | Successful read or mutation returning a body. |
| `201 Created` | Resource created; `Location` header set. |
| `202 Accepted` | Async accepted (e.g. email send queued, ownership-transfer grace window opened). |
| `204 No Content` | Successful mutation with no body (revoke, mark-read, delete). |
| `400 Bad Request` | Malformed body/params, validation failure (`VALIDATION_FAILED`), bad cursor/sort. |
| `401 Unauthorized` | Missing/invalid/expired access token or refresh. |
| `403 Forbidden` | Authenticated but lacks permission (role, block, guest restriction). |
| `404 Not Found` | Resource absent **or** hidden from caller (avoid existence leaks on private rooms/DMs). |
| `409 Conflict` | Uniqueness/state conflict (duplicate friend request, idempotency reuse, already a member). |
| `410 Gone` | Expired/consumed single-use token (invite link, reset token). |
| `413 Payload Too Large` | Upload exceeds declared/allowed size. |
| `415 Unsupported Media Type` | Bad content type / disallowed upload mime. |
| `422 Unprocessable Entity` | Semantically invalid (e.g. YouTube id unresolvable, self-friend). |
| `429 Too Many Requests` | Rate limit exceeded. |
| `500 / 503` | Server/dependency failure; envelope `INTERNAL` / `SERVICE_UNAVAILABLE`. |

### 2.11 Common Error Codes

Cross-cutting codes (domain-specific codes appear with their endpoints):

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_FAILED` | 400 | DTO validation failed; `details.fields` lists offenders. |
| `INVALID_CURSOR` / `INVALID_SORT` | 400 | Bad pagination/sort param. |
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | Required idempotency key missing. |
| `IDEMPOTENCY_KEY_REUSED` | 409 | Same key, different body. |
| `UNAUTHENTICATED` | 401 | No/invalid/expired access token. |
| `TOKEN_EXPIRED` | 401 | Access token expired (client should refresh). |
| `CSRF_FAILED` | 403 | Missing/mismatched CSRF token on cookie route. |
| `FORBIDDEN` | 403 | Generic permission denial. |
| `GUEST_FORBIDDEN` | 403 | Endpoint requires a registered account. |
| `BLOCKED` | 403 | Action blocked by a `Block` relationship. |
| `NOT_FOUND` | 404 | Generic absence/hidden. |
| `CONFLICT` | 409 | Generic state/uniqueness conflict. |
| `RATE_LIMITED` | 429 | Throttled; see `details.bucket`. |
| `INTERNAL` | 500 | Unhandled server error. |
| `SERVICE_UNAVAILABLE` | 503 | Dependency (Mongo/MinIO/LiveKit) down; from `/health/ready`. |

---

## 3. Endpoint Catalog

> Legend: **Auth** column uses the notation from [§2.2](#22-authentication--authorization). All paths are relative to `/api/v1`. ◐ in the permission column means "gated by room config" per [Canon §6](#36-memberships--roles).

### 3.1 Auth

Maps to `AuthModule`. Full flow detail in [AUTH.md](./AUTH.md).

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/auth/register` | Public + Idem | Email/password registration; sends verification email. |
| `POST` | `/auth/login` | Public | Email/password login; may return a 2FA challenge. |
| `POST` | `/auth/2fa/challenge` | Public (challenge token) | Complete TOTP step-up; issues tokens. |
| `POST` | `/auth/refresh` | Cookie+CSRF | Rotate refresh + issue new access token. |
| `POST` | `/auth/logout` | Cookie+CSRF | Revoke current session; clears cookie. |
| `POST` | `/auth/guest` | Public | Create ephemeral guest session. |
| `POST` | `/auth/guest/upgrade` | Bearer (guest) | Upgrade guest → registered (attach credentials). |
| `GET` | `/auth/oauth/google` | Public | Begin Google OAuth (302 to Google). |
| `GET` | `/auth/oauth/google/callback` | Public | OAuth callback; issues tokens. |
| `POST` | `/auth/email/verify` | Public (token) | Confirm email verification token. |
| `POST` | `/auth/email/resend` | Bearer | Resend verification email (`202`). |
| `POST` | `/auth/password/forgot` | Public | Begin password reset (always `202`, no user enumeration). |
| `POST` | `/auth/password/reset` | Public (token) | Complete reset with single-use token. |
| `POST` | `/auth/2fa/enroll` | Bearer (registered) | Begin TOTP enrollment; returns secret + otpauth URI. |
| `POST` | `/auth/2fa/enable` | Bearer (registered) + 2FA | Verify first TOTP; returns recovery codes. |
| `POST` | `/auth/2fa/disable` | Bearer (registered) + 2FA | Disable TOTP. |
| `GET` | `/auth/sessions` | Bearer | List this user's device sessions. |
| `DELETE` | `/auth/sessions/:sessionId` | Bearer + Self | Revoke one session. |
| `DELETE` | `/auth/sessions` | Bearer | Revoke all **other** sessions. |

**`POST /auth/login`**

Request:

```json
{ "email": "ada@example.com", "password": "•••••••••", "deviceLabel": "Chrome on Windows" }
```

Response `200` (no 2FA) — sets `cw_rt` + `cw_csrf` cookies:

```json
{
  "accessToken": "eyJhbGciOiJSUzI1Ni␣…",
  "expiresIn": 900,
  "tokenType": "Bearer",
  "user": {
    "id": "665f1c2a9b4e1a0012ab34cd",
    "kind": "registered",
    "displayName": "Ada",
    "avatarUrl": "https://cdn.cowatch.tv/u/665f….webp",
    "emailVerified": true
  }
}
```

Response `200` (2FA required) — **no** tokens yet:

```json
{ "challenge": "2fa", "challengeToken": "01J9Z…", "methods": ["totp"], "expiresIn": 300 }
```

Errors: `401 INVALID_CREDENTIALS`, `403 EMAIL_NOT_VERIFIED` (configurable), `423 ACCOUNT_LOCKED`, `429 RATE_LIMITED`.

**`POST /auth/refresh`** — Cookie+CSRF, no Bearer. Rotates the refresh family; reuse of a consumed token → `401 REFRESH_REUSE_DETECTED` + full family revocation.

```json
{ "accessToken": "eyJ…", "expiresIn": 900, "tokenType": "Bearer" }
```

**`GET /auth/sessions`** →

```json
{
  "data": [
    {
      "id": "6660aa…", "current": true, "deviceLabel": "Chrome on Windows",
      "userAgent": "Mozilla/5.0 …", "ipRegion": "EU-DE",
      "lastSeenAt": "2026-06-27T17:55:02.000Z", "createdAt": "2026-06-01T09:00:00.000Z"
    }
  ],
  "meta": { "total": 3 }
}
```

### 3.2 Users & Profiles

Maps to `UsersModule`. `me` is the canonical self alias from [Canon §3](../context/architecture.md#3-naming-conventions).

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/me` | Bearer | Full self profile + settings + flags. |
| `PATCH` | `/me` | Bearer (registered) | Update own profile (displayName, bio, presence prefs). |
| `PATCH` | `/me/settings` | Bearer | Update notification/privacy/appearance settings. |
| `PUT` | `/me/avatar` | Bearer (registered) | Set avatar from a completed upload id. |
| `DELETE` | `/me` | Bearer (registered) + 2FA | Delete/anonymize account (soft-delete + purge schedule). |
| `GET` | `/users/:userId` | Bearer | Public profile (respecting privacy + blocks). |
| `GET` | `/users/:userId/presence` | Bearer | Presence snapshot (realtime stream is separate). |
| `GET` | `/users/:userId/mutual-friends` | Bearer (registered) | Mutual friends list. |

**`GET /me`** →

```json
{
  "id": "665f1c2a9b4e1a0012ab34cd",
  "kind": "registered",
  "email": "ada@example.com",
  "emailVerified": true,
  "displayName": "Ada",
  "handle": "ada",
  "avatarUrl": "https://cdn.cowatch.tv/u/665f….webp",
  "bio": "Watcher of films.",
  "presence": { "status": "online", "activity": { "kind": "room", "roomId": "6671…" } },
  "twoFactorEnabled": true,
  "settings": { "notifications": { "friendOnline": true, "dm": true }, "privacy": { "discoverable": true } },
  "createdAt": "2026-06-01T09:00:00.000Z",
  "updatedAt": "2026-06-27T17:55:02.000Z"
}
```

`GET /users/:userId` returns the **public projection** (no email/settings); fields hidden by the target's privacy or a `Block` are omitted. If the caller is blocked or the target is private + non-friend → `404 NOT_FOUND` (no existence leak).

### 3.3 Friends & Friend Requests

Maps to `SocialModule` (friends/presence/dm shared logic in `packages/social`). Collections `friendships`, `friend_requests`.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/friends` | Bearer (registered) | List accepted friends (with presence snapshot). |
| `DELETE` | `/friends/:userId` | Bearer (registered) | Remove a friend (mutual). |
| `GET` | `/friends/requests` | Bearer (registered) | List pending requests; `filter[direction]=incoming\|outgoing`. |
| `POST` | `/friends/requests` | Bearer (registered) + Idem | Send a friend request. |
| `POST` | `/friends/requests/:requestId/accept` | Bearer (registered) | Accept → creates `Friendship`. |
| `POST` | `/friends/requests/:requestId/decline` | Bearer (registered) | Decline a request. |
| `DELETE` | `/friends/requests/:requestId` | Bearer (registered) | Cancel an outgoing request. |

**`POST /friends/requests`**

Request (target by id **or** handle):

```json
{ "toUserId": "667a…", "note": "Hey, add me!" }
```

Response `201`:

```json
{
  "id": "6690…", "fromUserId": "665f…", "toUserId": "667a…",
  "status": "pending", "createdAt": "2026-06-27T18:10:00.000Z"
}
```

Errors: `409 FRIEND_REQUEST_EXISTS` (duplicate/pending), `409 ALREADY_FRIENDS`, `403 BLOCKED` (either direction), `422 SELF_FRIEND_FORBIDDEN`, `404 NOT_FOUND` (target undiscoverable). Accepting a request where a reverse pending request exists auto-merges into a `Friendship`.

### 3.4 Blocks

Maps to `SocialModule`. Collection `blocks` (directed). Blocking removes any friendship/requests and suppresses DMs, mentions, presence, and discovery visibility between the pair.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/blocks` | Bearer (registered) | List users I have blocked. |
| `POST` | `/blocks` | Bearer (registered) | Block a user. |
| `DELETE` | `/blocks/:userId` | Bearer (registered) | Unblock. |

**`POST /blocks`** request `{ "userId": "667a…" }` → `201 { "userId": "667a…", "createdAt": "…" }`. Idempotent re-block returns `200`. Self-block → `422 SELF_BLOCK_FORBIDDEN`.

### 3.5 Rooms

Maps to `RoomsModule`. Collection `rooms`. Visibility `public` \| `private` \| `password` ([Canon §1](../context/architecture.md#1-glossary-of-core-domain-terms)). Settings (capped, owned) are embedded; playlist/messages/members are referenced.

| Method | Path | Auth | Permission | Purpose |
|---|---|---|---|---|
| `POST` | `/rooms` | Bearer + Idem | — | Create a room (caller becomes `Owner`). |
| `GET` | `/rooms/:roomId` | Bearer | visibility-gated | Room detail + playback snapshot + my membership. |
| `PATCH` | `/rooms/:roomId` | `Member:Owner` | change room settings | Update settings (name, visibility, sync authority, locks, NSFW, tags). |
| `DELETE` | `/rooms/:roomId` | `Member:Owner` | — | Delete (temporary) / archive (permanent) room. |
| `POST` | `/rooms/:roomId/join` | Bearer | visibility/password/approval | Join a room (creates `Membership`). |
| `POST` | `/rooms/:roomId/leave` | `Member:Guest` | self | Leave; may trigger ownership transfer. |
| `GET` | `/rooms/:roomId/playback` | `Member:Guest` | — | Server-authoritative `PlaybackState` snapshot (mutations are realtime-only). |
| `POST` | `/rooms/:roomId/ownership/transfer` | `Member:Owner` | assign/transfer ownership | Explicit ownership transfer to a target member. |
| `GET` | `/rooms/:roomId/invites` | `Member:Moderator` | — | List active invite links. |
| `POST` | `/rooms/:roomId/invites` | `Member:Moderator` + Idem | — | Create an invite link (optionally expiring/single-use). |
| `DELETE` | `/rooms/:roomId/invites/:inviteId` | `Member:Moderator` | — | Revoke an invite link. |
| `POST` | `/rooms/join-by-invite` | Bearer | invite token | Join via an `InviteLink` token. |
| `GET` | `/rooms/:roomId/join-requests` | `Member:Moderator` | join approval | List pending join requests. |
| `POST` | `/rooms/:roomId/join-requests/:reqId/approve` | `Member:Moderator` | join approval | Approve a pending join. |
| `POST` | `/rooms/:roomId/join-requests/:reqId/reject` | `Member:Moderator` | join approval | Reject a pending join. |

**`POST /rooms`**

Request:

```json
{
  "name": "Friday Movie Night",
  "visibility": "password",
  "password": "popcorn",
  "kind": "temporary",
  "nsfw": false,
  "tags": ["movies", "horror"],
  "settings": {
    "syncAuthority": "owner_moderators",
    "playlistAuthority": "owner_moderators",
    "chatLock": false,
    "playlistLock": false,
    "joinApproval": false
  }
}
```

Response `201` (`Location: /api/v1/rooms/6671…`):

```json
{
  "id": "6671c2a9b4e1a0012ab34cd",
  "name": "Friday Movie Night",
  "visibility": "password",
  "kind": "temporary",
  "nsfw": false,
  "tags": ["movies", "horror"],
  "ownerId": "665f…",
  "ownerDisplayName": "Ada",
  "viewerCount": 1,
  "currentVideoTitle": null,
  "isActive": true,
  "settings": {
    "syncAuthority": "owner_moderators",
    "playlistAuthority": "owner_moderators",
    "chatLock": false, "playlistLock": false, "joinApproval": false
  },
  "myMembership": { "role": "Owner", "joinedAt": "2026-06-27T18:00:00.000Z" },
  "createdAt": "2026-06-27T18:00:00.000Z",
  "updatedAt": "2026-06-27T18:00:00.000Z"
}
```

`ownerDisplayName`, `viewerCount`, `currentVideoTitle` are **denormalized** read-hot snapshots ([Canon §4](../context/architecture.md#4-data-modeling-conventions-mongodb--prisma)); the owning aggregates re-fan updates.

**`POST /rooms/:roomId/join`** request `{ "password": "popcorn" }` (omit for public). Responses: `200` (joined, returns membership + room), `202 JOIN_PENDING_APPROVAL` (approval required → creates a join request), `403 ROOM_PASSWORD_REQUIRED` / `403 BANNED_FROM_ROOM`, `404 ROOM_NOT_FOUND`, `409 ALREADY_MEMBER`, `403 ROOM_FULL`.

**`GET /rooms/:roomId/playback`** → snapshot only (the clock is owned by `playback:sync` realtime per [SYNC.md](./SYNC.md)):

```json
{
  "itemId": "6680…",
  "provider": "youtube",
  "providerVideoId": "dQw4w9WgXcQ",
  "positionMs": 84210,
  "isPlaying": true,
  "rate": 1,
  "serverEpochMs": 1782000261123,
  "authority": "owner_moderators"
}
```

**`POST /rooms/:roomId/ownership/transfer`** request `{ "toUserId": "667a…" }` → `200` updated room; emits `room:ownership:transfer` + a `room.ownership_transfer` notification. Auto-transfer on owner disconnect is realtime/server-driven per [Canon §6](../context/architecture.md#6-permission-model) and is **not** a REST endpoint.

### 3.6 Memberships & Roles

Maps to `MembershipsModule`. Collection `memberships` (unique `(roomId, userId)`). This is the unit the permission model operates on; roles per [Canon §6](../context/architecture.md#6-permission-model).

| Method | Path | Auth | Permission | Purpose |
|---|---|---|---|---|
| `GET` | `/rooms/:roomId/members` | `Member:Guest` | — | List members (role, presence, mute/timeout state). |
| `GET` | `/rooms/:roomId/members/:userId` | `Member:Guest` | — | One member's membership detail. |
| `PATCH` | `/rooms/:roomId/members/:userId/role` | `Member:Owner` | assign moderators | Promote/demote (`Moderator`\|`Member`). |
| `POST` | `/rooms/:roomId/members/:userId/kick` | `Member:Moderator` | kick | Remove member (may rejoin unless banned). |
| `POST` | `/rooms/:roomId/members/:userId/ban` | `Member:Moderator` | ban | Ban member from the room. |
| `DELETE` | `/rooms/:roomId/bans/:userId` | `Member:Moderator` | ban | Unban. |
| `POST` | `/rooms/:roomId/members/:userId/mute` | `Member:Moderator` | mute/timeout | Mute (chat/voice) member. |
| `POST` | `/rooms/:roomId/members/:userId/timeout` | `Member:Moderator` | mute/timeout | Timeout member for a duration. |
| `DELETE` | `/rooms/:roomId/members/:userId/mute` | `Member:Moderator` | mute/timeout | Unmute. |

**`PATCH /rooms/:roomId/members/:userId/role`** request `{ "role": "Moderator" }` → `200` updated membership. A `Moderator` cannot modify an `Owner` or assign `Owner` (use ownership transfer) → `403 FORBIDDEN`. Acting on a higher/equal role → `403 INSUFFICIENT_ROLE`.

**`POST /rooms/:roomId/members/:userId/timeout`** request:

```json
{ "durationSeconds": 600, "reason": "spam" }
```

Response `200`:

```json
{
  "roomId": "6671…", "userId": "667a…", "role": "Member",
  "userDisplayName": "Bob", "userAvatarUrl": "https://cdn…/u/667a.webp",
  "timeoutUntil": "2026-06-27T18:20:00.000Z", "muted": false, "banned": false,
  "joinedAt": "2026-06-27T18:02:00.000Z"
}
```

`userDisplayName`/`userAvatarUrl` are denormalized per [Canon §4](../context/architecture.md#4-data-modeling-conventions-mongodb--prisma). All moderation actions broadcast the corresponding `room:member:*` realtime event.

### 3.7 Playlist & Queue

Maps to `PlaylistModule`. Collections `playlists` (1:1 with room), `queue_items` (referenced, ordered). Add/reorder/remove gated by `playlistAuthority` + `playlistLock` ([Canon §6](../context/architecture.md#6-permission-model)). Provider: YouTube first.

| Method | Path | Auth | Permission | Purpose |
|---|---|---|---|---|
| `GET` | `/rooms/:roomId/playlist` | `Member:Guest` | — | Ordered queue snapshot. |
| `POST` | `/rooms/:roomId/playlist/items` | `Member:Member` + Idem | ◐ playlist control | Add a YouTube video/playlist to the queue. |
| `PATCH` | `/rooms/:roomId/playlist/items/:itemId` | `Member:Member` | ◐ playlist control | Reorder (position) / edit metadata. |
| `DELETE` | `/rooms/:roomId/playlist/items/:itemId` | `Member:Member` | ◐ playlist control | Remove an item. |
| `POST` | `/rooms/:roomId/playlist/items/:itemId/vote` | `Member:Guest` | — | Up/down vote an item (reorders by votes if enabled). |
| `POST` | `/rooms/:roomId/playlist/skip-vote` | `Member:Guest` | — | Cast a skip vote for the current item. |
| `DELETE` | `/rooms/:roomId/playlist` | `Member:Moderator` | playlist control | Clear the queue. |

**`POST /rooms/:roomId/playlist/items`**

Request (single video by id or URL):

```json
{ "provider": "youtube", "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "position": "end" }
```

Response `201`:

```json
{
  "id": "6680c2a9b4e1a0012ab34cd",
  "playlistId": "667f…",
  "provider": "youtube",
  "providerVideoId": "dQw4w9WgXcQ",
  "title": "Never Gonna Give You Up",
  "durationMs": 213000,
  "thumbnailUrl": "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  "addedBy": "665f…",
  "addedByDisplayName": "Ada",
  "position": 7,
  "votes": 0,
  "createdAt": "2026-06-27T18:11:00.000Z"
}
```

Errors: `422 VIDEO_UNRESOLVABLE` (bad/unavailable id), `403 PLAYLIST_LOCKED`, `403 FORBIDDEN_PLAYLIST_AUTHORITY`, `409 DUPLICATE_QUEUE_ITEM` (config-gated), `413 PLAYLIST_FULL`. `addedByDisplayName` is denormalized. Skip-vote outcome and queue advance are **synced** via realtime; the REST endpoint only records the vote and returns the tally:

```json
{ "currentItemId": "6680…", "skipVotes": 4, "required": 6, "skipped": false }
```

### 3.8 Messages & DMs

Maps to `ChatModule`. Collections `messages` (channel-scoped: room channel **or** DM thread), `dm_threads`. Messages are **referenced**, never embedded ([Canon §4](../context/architecture.md#4-data-modeling-conventions-mongodb--prisma)). Real-time delivery is via `chat:message:new`; REST is for **history, send fallback, edit, delete, reactions**.

| Method | Path | Auth | Permission | Purpose |
|---|---|---|---|---|
| `GET` | `/rooms/:roomId/messages` | `Member:Guest` | — | Room chat history (cursor, newest-first). |
| `POST` | `/rooms/:roomId/messages` | `Member:Guest` + Idem | ◐ send chat / chatLock | Send a room message. |
| `PATCH` | `/rooms/:roomId/messages/:messageId` | author | — | Edit own message. |
| `DELETE` | `/rooms/:roomId/messages/:messageId` | author or `Member:Moderator` | — | Delete (soft) a message. |
| `POST` | `/rooms/:roomId/messages/:messageId/reactions` | `Member:Guest` | — | Add an emoji reaction. |
| `DELETE` | `/rooms/:roomId/messages/:messageId/reactions/:emoji` | `Member:Guest` | — | Remove own reaction. |
| `GET` | `/dms` | Bearer (registered) | — | List DM threads (last message preview). |
| `POST` | `/dms` | Bearer (registered) | — | Open/get a DM thread with a user. |
| `GET` | `/dms/:threadId/messages` | Bearer (registered) + participant | — | DM history. |
| `POST` | `/dms/:threadId/messages` | Bearer (registered) + participant + Idem | — | Send a DM. |
| `POST` | `/dms/:threadId/read` | Bearer (registered) + participant | — | Mark thread read up to a message. |

**`POST /rooms/:roomId/messages`**

Request:

```json
{
  "body": "this scene is incredible 🍿",
  "mentions": ["667a…"],
  "attachments": [ { "kind": "gif", "url": "https://media.tenor.com/…/popcorn.gif", "width": 320, "height": 240 } ],
  "replyToMessageId": null
}
```

Response `201`:

```json
{
  "id": "6690c2a9b4e1a0012ab34cd",
  "channel": { "kind": "room", "roomId": "6671…" },
  "authorId": "665f…",
  "authorDisplayName": "Ada",
  "authorAvatarUrl": "https://cdn…/u/665f.webp",
  "body": "this scene is incredible 🍿",
  "mentions": ["667a…"],
  "attachments": [ { "kind": "gif", "url": "https://media.tenor.com/…/popcorn.gif", "width": 320, "height": 240 } ],
  "reactions": [],
  "editedAt": null,
  "createdAt": "2026-06-27T18:12:00.000Z"
}
```

`authorDisplayName`/`authorAvatarUrl` denormalized; `reactions` is a **capped embedded** array ([Canon §4](../context/architecture.md#4-data-modeling-conventions-mongodb--prisma)). Errors: `403 CHAT_LOCKED`, `403 GUEST_CHAT_DISABLED`, `403 MUTED`, `403 BLOCKED` (DM where a block exists), `404` (not a member/participant), `429 message-send` bucket. DMs between blocked users → `403 BLOCKED`. History defaults to newest-first; use `direction=backward` to page older.

### 3.9 Notifications

Maps to `NotificationsModule`. Collection `notifications`, indexed `(userId, readAt, createdAt)`. Types per [Canon §1](../context/architecture.md#1-glossary-of-core-domain-terms): `friend.online`, `friend.room_started`, `friend.invitation`, `mention`, `dm`, `room.ownership_transfer`, `room.user_joined`. Realtime push is `notification:new`; REST owns feed/read-state.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/notifications` | Bearer | Feed (cursor); `filter[unread]=true`, `filter[type]=mention`. |
| `GET` | `/notifications/unread-count` | Bearer | Badge count. |
| `POST` | `/notifications/:id/read` | Bearer + Self | Mark one read. |
| `POST` | `/notifications/read-all` | Bearer | Mark all read (`204`). |
| `DELETE` | `/notifications/:id` | Bearer + Self | Dismiss one. |

**`GET /notifications`** →

```json
{
  "data": [
    {
      "id": "66a0…",
      "type": "friend.invitation",
      "actor": { "id": "667a…", "displayName": "Bob", "avatarUrl": "https://cdn…/u/667a.webp" },
      "subject": { "kind": "room", "roomId": "6671…", "roomName": "Friday Movie Night" },
      "readAt": null,
      "createdAt": "2026-06-27T18:13:00.000Z"
    }
  ],
  "meta": { "nextCursor": "eyJ…", "hasMore": false, "limit": 25, "total": null }
}
```

`GET /notifications/unread-count` → `{ "count": 7 }`.

### 3.10 Discovery & Search

Maps to `DiscoveryModule`. Reads denormalized `rooms` fields (`viewerCount`, `currentVideoTitle`, `visibility`, `isActive`, `tags`, `nsfw`) per [Canon §4](../context/architecture.md#4-data-modeling-conventions-mongodb--prisma); search spans users, friends, rooms, messages, videos, tags ([SPEC DISCOVERY]). Uses the `search` rate bucket.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/discovery/rooms` | Bearer | Browse public/active rooms (name, current video, viewers, tags, NSFW, friends inside). |
| `GET` | `/discovery/rooms/trending` | Bearer | Trending rooms. |
| `GET` | `/discovery/tags` | Bearer | Popular tags. |
| `GET` | `/search` | Bearer | Unified search across scopes. |

**`GET /discovery/rooms`** query: `filter[tags]=movies&filter[nsfw]=false&sort=-viewerCount&cursor=…&limit=20`:

```json
{
  "data": [
    {
      "id": "6671…",
      "name": "Friday Movie Night",
      "visibility": "public",
      "currentVideoTitle": "Never Gonna Give You Up",
      "viewerCount": 42,
      "tags": ["movies", "horror"],
      "nsfw": false,
      "friendsInside": [ { "id": "667a…", "displayName": "Bob", "avatarUrl": "https://cdn…/u/667a.webp" } ]
    }
  ],
  "meta": { "nextCursor": "eyJ…", "hasMore": true, "limit": 20, "total": null }
}
```

`friendsInside` is computed per-caller (requires registered account; empty for guests). Password rooms appear in discovery but require the join password; private rooms never appear.

**`GET /search`** query: `?q=horror&scope=rooms,users,videos&limit=10`:

```json
{
  "data": {
    "rooms":  [ { "id": "6671…", "name": "Friday Movie Night", "viewerCount": 42 } ],
    "users":  [ { "id": "667a…", "displayName": "Bob", "handle": "bob", "isFriend": true } ],
    "videos": [ { "provider": "youtube", "providerVideoId": "abcd1234", "title": "Horror Mix" } ]
  },
  "meta": { "scopes": ["rooms", "users", "videos"], "perScopeLimit": 10 }
}
```

`scope` is a comma list of `users|friends|rooms|messages|videos|tags`; omit for all. Message search returns only messages in channels the caller can read. Blocked users are excluded from `users`/`friends` results.

### 3.11 Voice Tokens

Maps to `VoiceModule`. LiveKit-backed ([ADR-005](../adr/ADR-005-livekit-voice.md) · [LIVEKIT.md](./LIVEKIT.md)). Cowatch issues a short-lived **LiveKit access token**; clients connect directly to the LiveKit SFU. Channels live under a room; visibility `public` \| `password`.

| Method | Path | Auth | Permission | Purpose |
|---|---|---|---|---|
| `GET` | `/rooms/:roomId/voice/channels` | `Member:Guest` | — | List voice channels in the room. |
| `POST` | `/rooms/:roomId/voice/channels` | `Member:Moderator` | — | Create a voice channel. |
| `DELETE` | `/rooms/:roomId/voice/channels/:channelId` | `Member:Moderator` | — | Delete a voice channel. |
| `POST` | `/rooms/:roomId/voice/channels/:channelId/token` | `Member:Guest` | password if `password` channel | Mint a LiveKit join token. |

**`POST /rooms/:roomId/voice/channels/:channelId/token`**

Request:

```json
{ "password": "secret", "publishAudio": true, "publishVideo": false, "publishScreen": false }
```

Response `200`:

```json
{
  "livekitUrl": "wss://sfu.cowatch.tv",
  "token": "eyJhbGciOiJIUzI1Ni␣…",
  "roomName": "6671_voice_66b0",
  "identity": "665f…",
  "expiresAt": "2026-06-27T18:20:00.000Z",
  "grants": { "canPublishAudio": true, "canPublishVideo": false, "canPublishScreen": false, "canSubscribe": true }
}
```

The LiveKit room name and per-identity grants are derived server-side from the caller's `Membership` + mute/timeout state; a muted member receives `canPublishAudio:false`. Errors: `403 VOICE_PASSWORD_REQUIRED`, `403 MUTED`, `404 VOICE_CHANNEL_NOT_FOUND`, `503 VOICE_UNAVAILABLE` (LiveKit down).

### 3.12 Uploads

Maps to `StorageModule` over MinIO ([ADR-009](../adr/ADR-009-minio-storage.md)). Pattern: **presigned, two-phase** — client requests a presigned `PUT` URL, uploads bytes directly to MinIO, then confirms. Server never proxies bytes. Buckets follow least-privilege; downloads via signed URLs.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/uploads` | Bearer (registered) + Idem | Create an upload intent → presigned PUT URL. |
| `POST` | `/uploads/:uploadId/complete` | Bearer (registered) | Confirm upload; server validates size/mime, returns CDN URL. |
| `GET` | `/uploads/:uploadId` | Bearer + owner | Upload status. |

**`POST /uploads`**

Request:

```json
{ "purpose": "avatar", "contentType": "image/webp", "byteSize": 84210, "fileName": "me.webp" }
```

Response `201`:

```json
{
  "uploadId": "66c0…",
  "method": "PUT",
  "url": "https://minio.cowatch.tv/uploads-avatars/66c0…?X-Amz-Signature=…",
  "headers": { "Content-Type": "image/webp" },
  "expiresAt": "2026-06-27T18:25:00.000Z",
  "maxBytes": 5242880
}
```

`purpose ∈ {avatar, room_asset, attachment}` selects the bucket + size/mime allowlist. `413 UPLOAD_TOO_LARGE` if `byteSize` exceeds the purpose cap; `415 UNSUPPORTED_MEDIA_TYPE` for a disallowed mime. **`POST /uploads/:uploadId/complete`** → `200 { "uploadId": "66c0…", "url": "https://cdn.cowatch.tv/u/66c0….webp", "purpose": "avatar" }`. The returned `uploadId`/`url` is what feeds `PUT /me/avatar` or a message attachment.

### 3.13 Health & Meta

Operational endpoints ([Canon §10](../context/architecture.md#10-cross-cutting-non-negotiables)), unversioned (outside `/api/v1`).

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/health/live` | Public | Liveness (process up). `200` always when serving. |
| `GET` | `/health/ready` | Public | Readiness (Mongo/MinIO/LiveKit reachable). `503 SERVICE_UNAVAILABLE` if a dependency is down. |
| `GET` | `/api/v1/meta` | Public | API version, build sha, supported features. |

---

## 4. Permission Matrix → Endpoint Map

Anchors the [Canon §6](../context/architecture.md#6-permission-model) matrix to concrete routes (see [PERMISSIONS.md](./PERMISSIONS.md) for enforcement). ◐ = gated by room config (`syncAuthority` / `playlistAuthority` / `chatLock` / `playlistLock`).

| Permission | Endpoint(s) | Owner | Moderator | Member | Guest |
|---|---|:--:|:--:|:--:|:--:|
| kick | `POST /rooms/:id/members/:uid/kick` | ✓ | ✓ | ✗ | ✗ |
| ban | `POST /rooms/:id/members/:uid/ban` | ✓ | ✓ | ✗ | ✗ |
| mute / timeout | `…/mute`, `…/timeout` | ✓ | ✓ | ✗ | ✗ |
| playback control | *realtime `playback:*`* (not REST) | ✓ | ◐ | ◐ | ✗ |
| playlist control | `POST/PATCH/DELETE /rooms/:id/playlist/items*` | ✓ | ✓ | ◐ | ✗ |
| chat lock toggle | `PATCH /rooms/:id` (`settings.chatLock`) | ✓ | ✓ | ✗ | ✗ |
| playlist lock toggle | `PATCH /rooms/:id` (`settings.playlistLock`) | ✓ | ✓ | ✗ | ✗ |
| join approval | `…/join-requests/:id/(approve\|reject)` | ✓ | ✓ | ✗ | ✗ |
| change room settings | `PATCH /rooms/:id` | ✓ | ✗ | ✗ | ✗ |
| assign mods / transfer ownership | `…/members/:uid/role`, `…/ownership/transfer` | ✓ | ✗ | ✗ | ✗ |
| send chat | `POST /rooms/:id/messages` | ✓ | ✓ | ✓ | ◐ |

> **Playback mutation is realtime-only.** REST exposes only `GET /rooms/:roomId/playback` (snapshot). Authority enforcement (`owner_only` \| `owner_moderators` \| `everyone`) and `FORBIDDEN_SYNC` rejection live in the WS gateway per [Canon §7](../context/architecture.md#7-sync-algorithm).

---

## 5. Open Questions

| # | Question | Recommendation |
|---|---|---|
| 1 | Should message/skip-vote sends accept a **REST** path at all, or be realtime-exclusive? | **Keep REST as a fallback + history source.** Realtime is the primary path; REST `POST` exists for offline/desktop resend and idempotent dedupe. Document both as equivalent and idempotency-keyed. |
| 2 | DM thread creation: implicit on first message vs explicit `POST /dms`? | **Keep explicit `POST /dms`** (returns existing thread if present) so the client gets a `threadId` before composing; first message uses `POST /dms/:threadId/messages`. |
| 3 | Should `GET /users/:userId` support **handle** lookup (`/users/@bob`)? | **Yes — add `GET /users/by-handle/:handle`** as a sibling to avoid ambiguity between ObjectId and handle in one param. |
| 4 | Offset pagination on discovery for "jump to page N"? | **No for v1.** Cursor-only; infinite scroll covers all current UIs. Revisit if an admin console needs page jumps. |
| 5 | GIF provider (Tenor/Giphy) proxying — does the server mint signed GIF URLs or store the third-party URL? | **Store the third-party URL in v1** (attachment `kind:"gif"`), with a server-side allowlist of GIF host domains; revisit caching to MinIO if rate limits bite. |
| 6 | Skip-vote threshold formula (fixed % vs absolute) — config location? | **Room setting `skipVoteThreshold` (default 0.5 of active viewers).** Lives in embedded room `settings`; surfaced in `PATCH /rooms/:id`. Flag for the Media Engineer to confirm. |
| 7 | Should `POST /rooms/:roomId/join` for a `password` room rate-limit failed password attempts separately? | **Yes — add a `room-join` strict sub-bucket** (per IP + per room) to deter password brute force. Confirm limits with DevOps. |

---

*End of REST API contract. Realtime event contracts are specified separately; this document is the source of truth for HTTP route shapes, which MUST match [Canon §3](../context/architecture.md#3-naming-conventions) verbatim.*
