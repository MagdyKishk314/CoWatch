# Chat Feature Specification

> R5 feature spec for Cowatch chat: room channel + DM thread messaging, emoji reactions, GIF/emoji attachments, mentions, typing indicators, edit/delete, moderation (chat lock, mute, delete), history, ordering/idempotency, and notification fan-out.

**Status:** Draft — Planning (Phase 4: Chat)
**Owner agent:** Chief Architect (spec) → Backend Engineer (implementation)
**Last updated: 2026-06-27**

> **Canon compliance.** This spec is downstream of and MUST comply with the [Architecture Canon](../context/architecture.md). On any conflict, the canon wins. It implements [Canon §1 Glossary](../context/architecture.md#1-glossary-of-core-domain-terms) (`Message`, `Notification`), [Canon §4 Data Modeling](../context/architecture.md#4-data-modeling-conventions-mongodb--prisma) (messages referenced, reactions capped-embed), [Canon §5 Realtime](../context/architecture.md#5-realtime-transport-abstraction-adr-004), and [Canon §6 Permissions](../context/architecture.md#6-permission-model) (`send chat`, `chatLock`). Type/event names match canon and sibling docs **verbatim**.

**Primary references**

- Canon: [§1 Glossary](../context/architecture.md#1-glossary-of-core-domain-terms) · [§4 Data Modeling](../context/architecture.md#4-data-modeling-conventions-mongodb--prisma) · [§5 Realtime](../context/architecture.md#5-realtime-transport-abstraction-adr-004) · [§6 Permissions](../context/architecture.md#6-permission-model) · [§10 Non-Negotiables](../context/architecture.md#10-cross-cutting-non-negotiables)
- ADR: [ADR-002 — NestJS](../adr/ADR-002-nestjs.md) · [ADR-003 — Prisma over MongoDB](../adr/ADR-003-prisma.md) · [ADR-004 — Realtime abstraction](../adr/ADR-004-realtime.md)
- Design docs: [EVENTS.md §5.6 chat](../docs/EVENTS.md#56-chat-chat) · [API.md §3.8 Messages & DMs](../docs/API.md#38-messages--dms) · [PERMISSIONS.md §3 (send chat / chatLock)](../docs/PERMISSIONS.md#3-role--permission-matrix) · [DOMAIN.md §3.10 Message / §3.11 DmThread](../docs/DOMAIN.md#310-message) · [DATABASE.md §4.9 messages / §4.10 dm_threads](../docs/DATABASE.md#49-messages) · [SOCIAL.md](../docs/SOCIAL.md) (DM/block context)
- Sibling specs: [auth.spec.md](./auth.spec.md) · [rooms.spec.md](./rooms.spec.md) · [sync.spec.md](./sync.spec.md)

---

## 1. Overview & User Value

Chat is the conversation layer of a watch party. A **Message** is channel-scoped — either a **Room channel** or a **DM thread** (canon §1) — and may carry reactions, mentions, and GIF/emoji attachments.

User value:

- **Talk while you watch** — real-time room chat with **typing indicators**, **emoji reactions**, and **GIFs**, delivered over the same multiplexed socket as playback.
- **Reach the right person** — **@mentions** that ping with a `mention` notification; **direct messages** between friends with their own threads.
- **Express fast** — one-tap emoji reactions and GIF attachments.
- **Keep it civil** — Owners/Moderators can **lock chat**, **mute** a member, and **delete** messages; authors can **edit/delete** their own.
- **Never lose the thread** — server-persisted, server-ordered history with reliable reconnect/resume.

This spec covers messaging in both channel kinds. **Room membership/permissions** are owned by [rooms.spec.md](./rooms.spec.md); the **social graph / blocks / DM-eligibility** by [docs/SOCIAL.md](../docs/SOCIAL.md); **notifications delivery** by Phase 6 (this spec emits the `mention`/`dm` fan-out).

---

## 2. Scope

### 2.1 In scope

- **Room channel messages** and **DM thread messages** (one `Message` model, channel-scoped).
- **Send** (realtime-primary `chat:message:new` + REST fallback/history), **edit**, **delete** (soft tombstone).
- **Reactions** (capped embedded array, canon §4) add/remove.
- **Attachments**: `gif` and `emoji` kinds (third-party GIF URL with host allowlist).
- **Mentions** resolution → `notification:new (mention)` fan-out.
- **Typing indicators** (ephemeral, fire-and-forget, never persisted).
- **DM threads**: open/get a thread, list threads, history, mark-read.
- **Moderation**: `chatLock` gating, `mute`/`timeout` suppression of sends, moderator delete of others' messages.
- **History** (cursor pagination), **ordering** (per-topic `seq`), **idempotency** (envelope `id`).
- **Block** enforcement on DMs (no DM between blocked users).

### 2.2 Out of scope (owned elsewhere)

- **Room roles, `chatLock`/mute toggling, kick/ban** mechanics → [rooms.spec.md](./rooms.spec.md) / [docs/PERMISSIONS.md](../docs/PERMISSIONS.md) (this spec *consumes* the resulting gate).
- **Friend graph, presence, block creation** → [docs/SOCIAL.md](../docs/SOCIAL.md) (this spec *reads* block/friend state for DM eligibility).
- **Notification feed read-state and delivery UI** → Phase 6 / `NotificationsModule` (this spec emits `mention`/`dm` notifications).
- **GIF provider integration (Tenor/Giphy search)** → Media (this spec stores the resulting URL with an allowlist).
- **Voice/video text overlays** → out of scope.
- **Realtime transport/resume internals** → [docs/REALTIME.md](../docs/REALTIME.md) / [EVENTS.md §8–9](../docs/EVENTS.md#8-reconnection--resume-replay).

---

## 3. Functional Requirements

| # | Requirement |
|---|---|
| **FR-1** | A `Message` is **channel-scoped**: exactly one of `roomId` (room channel) or `threadId` (DM thread) is set. Messages are a **referenced** collection (`messages`), never embedded (canon §4 hard rule). |
| **FR-2** | **Send** is realtime-primary via `chat:message:new` (ack-correlated); the server validates, persists, assigns `messageId` + per-topic `seq`, resolves mentions, and broadcasts the committed `Message`. A REST `POST` fallback (`/rooms/:roomId/messages`, `/dms/:threadId/messages`) exists for offline/desktop resend and history; both share the same idempotency key (envelope `id` / `Idempotency-Key`). |
| **FR-3** | Message `body` is 1..4000 chars after trim, validated via `class-validator` DTO (`SendMessageDto`). Empty/oversized → `VALIDATION_FAILED`. |
| **FR-4** | **Attachments** support `kind ∈ {gif, emoji}`; `gif` carries a third-party URL validated against a **server-side GIF host allowlist** (Tenor/Giphy) — disallowed host → `VALIDATION_FAILED`. The server stores the URL (v1; no MinIO re-hosting — [API.md OQ-5](../docs/API.md#5-open-questions)). |
| **FR-5** | **Mentions** (`mentions: userId[]`) are resolved server-side; each mentioned member who can read the channel receives a `notification:new (mention)`. Mentions of non-members / blocked users are dropped silently. |
| **FR-6** | **Edit** (`chat:message:edit`) is **author-only** within an edit window; the committed edit broadcasts `{ messageId, body, editedAt }`. Moderators **cannot edit** others' content (only delete). |
| **FR-7** | **Delete** (`chat:message:delete`) is allowed for the **author** or a room **Owner/Moderator**; it is a **soft-delete tombstone** (`deletedAt`, canon §4) broadcasting `{ messageId, deletedBy, tombstone: true }`. History filters `deletedAt`. |
| **FR-8** | **Reactions** (`chat:reaction:add`/`remove`) are a **capped embedded** array on the message (canon §4); idempotent per `(userId, messageId, emoji)`; the committed delta broadcasts `{ messageId, emoji, userId, count }`. |
| **FR-9** | **Typing** (`chat:typing`) is **ephemeral, fire-and-forget, never persisted, never acked**; the client debounces and the server throttles + fans out `{ …, userId, expiresAt }`; clients auto-expire the indicator at `expiresAt`. |
| **FR-10** | **`chatLock` gating** (canon §6 / [PERMISSIONS.md §3.2](../docs/PERMISSIONS.md#32-lock-interaction-notes-resolving-canon-ambiguity)): when `chatLock=on`, **Guest and Member** sends are rejected (`CHAT_LOCKED`); Owner/Moderator may still send. Guests' send is additionally gated by `chatLock` per the matrix (`send chat` = ◐ for Guest). |
| **FR-11** | A **muted** or **timed-out** member cannot send (`MUTED`); read/watch continues (mute state owned by [rooms.spec.md](./rooms.spec.md), read here). |
| **FR-12** | **DM threads**: `POST /dms` opens or returns the existing thread with a user; `GET /dms` lists threads (last-message preview); `GET /dms/:threadId/messages` returns history; `POST /dms/:threadId/read` marks read up to a message. DM send is `Bearer (registered) + participant`. |
| **FR-13** | **Block enforcement** (canon §1): a DM send/open between users where a `Block` exists in either direction is rejected `403 BLOCKED`; blocked users are excluded from DM eligibility and mention fan-out. |
| **FR-14** | Each DM message also fans out a `notification:new (dm)` to the recipient(s) (subject to read-state and per-user notification settings). |
| **FR-15** | **History** uses cursor (keyset) pagination, newest-first by default (`direction=backward` for older); per-topic order is the server-assigned `seq` — clients sort by `seq`, never by wall-clock `ts` (canon §5/§9). |
| **FR-16** | **Idempotency**: a repeated mutating intent with the same envelope `id` (or REST `Idempotency-Key`) performs no duplicate write and no duplicate broadcast and returns the original result (canon §9). |
| **FR-17** | **Denormalized identity** on each message: `authorDisplayName` + `authorAvatarUrl` (canon §4) so rendering needs no profile fetch; eventually consistent, re-fanned from the `User` source aggregate. |
| **FR-18** | Chat send is **rate-limited**: `message-send` REST bucket (per user + per channel) and the realtime `chat:message:new` bucket (burst 5, sustained 3/s); `chat:reaction:*` and `chat:typing` have their own buckets ([EVENTS.md §10](../docs/EVENTS.md#10-rate-limits), [API.md §2.8](../docs/API.md#28-rate-limiting)). Overage → `RATE_LIMITED`. |

---

## 4. Data Model Touchpoints

> Source of truth: `packages/database/prisma/schema.prisma`; entities in [DOMAIN.md](../docs/DOMAIN.md), schema in [DATABASE.md](../docs/DATABASE.md). Touchpoints only.

| Collection (`@@map`) | Role | Key fields / indexes | Ref |
|---|---|---|---|
| `messages` | Channel-scoped message (referenced) | `roomId?` **xor** `threadId?`, `authorId`, `body`, `attachments[]`, capped-embed `reactions[]`, `mentions[]`, `editedAt?`, `deletedAt?`, denorm `authorDisplayName/authorAvatarUrl`; index `(roomId, createdAt)` (canon-mandatory) + `(threadId, createdAt)` | [DOMAIN §3.10](../docs/DOMAIN.md#310-message) · [DATABASE §4.9](../docs/DATABASE.md#49-messages) |
| `dm_threads` | DM thread between participants | `participantIds[]` (2), `lastMessageAt`, per-participant `readUpToMessageId` | [DOMAIN §3.11](../docs/DOMAIN.md#311-dmthread) · [DATABASE §4.10](../docs/DATABASE.md#410-dm_threads) |
| `notifications` | `mention` / `dm` feed entries | `userId`, `type`, `actorId`, `targetMessageId?`, `targetThreadId?`/`targetRoomId?`, `readAt?`; index `(userId, readAt, createdAt)` (canon-mandatory) | [DOMAIN §3.12](../docs/DOMAIN.md#312-notification) |
| `memberships` (read) | `chatLock`/mute gate inputs | role + embedded mute/timeout state (owned by [rooms.spec.md](./rooms.spec.md)) | [DOMAIN §3.7](../docs/DOMAIN.md#37-membership) |
| `blocks` (read) | DM eligibility | directed block (owned by [SOCIAL.md](../docs/SOCIAL.md)) | [DOMAIN §3.5](../docs/DOMAIN.md#35-block) |

Canon compliance:

- **Reference** messages (unbounded, queried independently — canon §4 hard rule); **embed** `reactions` as a **capped** array (canon §4 "message `reactions` (capped)").
- Ids are **strings** across the boundary; `messageId`, correlation, and per-topic ordering use ULID/`seq` (canon §10, §9).
- **Soft-delete** via `deletedAt`; all history queries filter it (canon §4).
- **Denormalization registry** (canon §4 + [DOMAIN §7](../docs/DOMAIN.md#7-denormalization-snapshot-registry)): `Message.authorDisplayName/authorAvatarUrl` ← `User`; eventually consistent.
- Every collection carries `createdAt`/`updatedAt` (canon §4).

---

## 5. API & Event Surface

### 5.1 Realtime (`chat` namespace — [EVENTS.md §5.6](../docs/EVENTS.md#56-chat-chat))

Topic is the **room id** or the **DM thread id**. `chat:message:new` is a shared intent/truth `type`.

| Event | Direction | Ack | Payload | Notes |
|---|---|---|---|---|
| `chat:message:new` | C→S ack / S→C | ack / n/a | `SendMessageDto` → `MessageEvent` | Intent gated by `chatLock`/mute; server persists, assigns `seq`, resolves mentions, broadcasts committed message; mentions also fan out `notification:new (mention)`. |
| `chat:message:edit` | C→S ack / S→C | ack / n/a | `{ messageId, body }` → `{ messageId, body, editedAt }` | Author-only within edit window. |
| `chat:message:delete` | C→S ack / S→C | ack / n/a | `{ messageId, reason? }` → `{ messageId, deletedBy, tombstone:true }` | Author or Owner/Mod; soft-delete. |
| `chat:reaction:add` / `remove` | C→S ack / S→C | ack / n/a | `{ messageId, emoji }` → `{ messageId, emoji, userId, count }` | Idempotent per `(userId, messageId, emoji)`; capped embed. |
| `chat:typing` | C→S **fire** / S→C | fire / n/a | `{ roomId? \| threadId? }` → `{ …, userId, expiresAt }` | Ephemeral; never persisted/acked; throttled + auto-expiring. |

```ts
// packages/types — SendMessageDto / MessageEvent (mirrors EVENTS.md §5.6; SOURCE OF TRUTH in packages/types)
export interface SendMessageDto {
  roomId?: string;             // exactly one of roomId | threadId
  threadId?: string;
  body: string;                // 1..4000 chars after trim
  attachments?: { kind: 'gif' | 'emoji'; url?: string; providerId?: string }[];
  mentions?: string[];         // userIds; envelope.id (ULID) is the idempotency key
}
```

### 5.2 REST ([API.md §3.8](../docs/API.md#38-messages--dms))

| Method & Path | Permission | Purpose |
|---|---|---|
| `GET /rooms/:roomId/messages` | `Member:Guest` | Room chat history (cursor, newest-first). |
| `POST /rooms/:roomId/messages` | `Member:Guest` + ◐ chatLock + Idem | Send a room message (fallback). |
| `PATCH /rooms/:roomId/messages/:messageId` | author | Edit own message. |
| `DELETE /rooms/:roomId/messages/:messageId` | author or `Member:Moderator` | Soft-delete a message. |
| `POST /rooms/:roomId/messages/:messageId/reactions` | `Member:Guest` | Add emoji reaction. |
| `DELETE /rooms/:roomId/messages/:messageId/reactions/:emoji` | `Member:Guest` | Remove own reaction. |
| `GET /dms` | `Bearer (registered)` | List DM threads. |
| `POST /dms` | `Bearer (registered)` | Open/get a DM thread with a user. |
| `GET /dms/:threadId/messages` | `Bearer (registered)` + participant | DM history. |
| `POST /dms/:threadId/messages` | `Bearer (registered)` + participant + Idem | Send a DM. |
| `POST /dms/:threadId/read` | `Bearer (registered)` + participant | Mark thread read up to a message. |

### 5.3 Notification fan-out

| Notification type | Trigger | Target |
|---|---|---|
| `mention` (canon §1) | `mentions[]` resolved on a room/DM message | each mentioned, channel-readable, non-blocked user |
| `dm` (canon §1) | a DM message persisted | the other participant(s) |

Delivered via `notification:new` (S→C only; [EVENTS.md §5.9](../docs/EVENTS.md#59-notifications-notification--s-c-only)); read-state is owned by REST (`NotificationsModule`).

### 5.4 Error codes (canon §10 vocabulary; REST + `system:error` parity)

| Code | HTTP | When |
|---|---|---|
| `CHAT_LOCKED` | 403 | Send while `chatLock` on and actor below Moderator. |
| `MUTED` | 403 | Send while muted/timed-out. |
| `BLOCKED` | 403 | DM where a `Block` exists (either direction). |
| `VALIDATION_FAILED` | 400 | Bad body/attachment/disallowed GIF host. |
| `NOT_FOUND` | 404 | Not a member/participant; message hidden. |
| `RATE_LIMITED` | 429 | `message-send` / `chat:*` bucket exhausted. |
| `FORBIDDEN` | 403 | Edit others' content / delete without permission. |

---

## 6. Permissions

Chat consumes the **Membership-scoped** permission model (canon §6; [docs/PERMISSIONS.md](../docs/PERMISSIONS.md)). Relevant rows:

| Permission | Owner | Moderator | Member | Guest | Gating config |
|---|:--:|:--:|:--:|:--:|---|
| send chat | ✓ | ✓ | ✓ | ◐ | `chatLock` |
| delete others' message | ✓ | ✓ | ✗ | ✗ | — (moderation) |
| edit own message | author | author | author | author | edit window |
| react / typing | ✓ | ✓ | ✓ | ◐ | follows send/read gating |

Rules:

- **`chatLock=on`** suppresses send for **Guest and Member** ([PERMISSIONS.md OQ-1](../docs/PERMISSIONS.md#9-open-questions-with-recommendations) recommendation, mirrored in [rooms.spec.md OQ-R2](./rooms.spec.md#11-open-questions)); Owner/Moderator still send → `CHAT_LOCKED` for the suppressed.
- **Mute/timeout** (owned by rooms) suppresses send → `MUTED`.
- **Moderator delete** of others' messages is allowed; **edit** of others' is not (FR-6).
- **DM** requires both parties registered + participant + no `Block` (FR-13); enforcement parity across REST and the `chat` gateway (canon §6 transport parity).
- DMs do not use room roles; eligibility is friendship/block-based per [docs/SOCIAL.md](../docs/SOCIAL.md) (Open Question OQ-C2: friends-only vs. anyone).

---

## 7. Implementation Tasks

> Detailed breakdown lands in `tasks/chat.tasks.md` (Phase 4). High-level decomposition:

1. **Module** — scaffold `ChatModule` at `apps/server/src/modules/chat/` with controller, service, and a `chat` gateway registered through `RealtimeModule`.
2. **Prisma models** — `messages` (referenced; capped-embed `reactions`; `(roomId, createdAt)` + `(threadId, createdAt)` indexes; `deletedAt`), `dm_threads` (participants, read pointers); read access to `memberships`/`blocks`.
3. **Shared types** — `Message`, `MessageEvent`, `SendMessageDto`, `Reaction`, `Attachment`, `DmThread`, `TypingEvent` in `packages/types`.
4. **Send pipeline** — validate DTO, resolve `chatLock`/mute gate (via `PermissionService` + membership), persist, assign `seq`, denormalize author identity, broadcast committed message, idempotency cache by envelope `id`.
5. **Mentions** — resolve `mentions[]` to channel-readable, non-blocked members; emit `notification:new (mention)`.
6. **Attachments** — GIF host allowlist validation; emoji/gif persistence; no MinIO re-host (v1).
7. **Edit/delete** — author-window edit; author-or-moderator soft-delete tombstone; history filter on `deletedAt`.
8. **Reactions** — capped-embed add/remove, idempotent per `(userId, messageId, emoji)`, committed delta broadcast.
9. **Typing** — debounce + server throttle + fan-out with `expiresAt`; never persist/ack.
10. **DM threads** — open/get (idempotent), list with preview, history, mark-read; block enforcement; `notification:new (dm)` fan-out.
11. **History** — cursor pagination (newest-first, backward for older); order by `seq`.
12. **Cross-cutting** — `message-send` + realtime chat buckets, `correlationId` propagation, structured logging, REST↔WS permission parity.
13. **Tests & docs** — unit/integration/e2e (§8); update [docs/EVENTS.md](../docs/EVENTS.md)/[docs/API.md](../docs/API.md) cross-links, history + context + repomix + project-state per the per-feature workflow.

---

## 8. Test Plan

Coverage target **90%** (canon §10).

### 8.1 Unit
- `SendMessageDto` validation: 1..4000 body bounds, exactly-one-of `roomId`/`threadId`, attachment kind, GIF host allowlist.
- `chatLock` gate: Guest + Member suppressed when on; Owner/Mod allowed (`CHAT_LOCKED`).
- Mute/timeout gate → `MUTED`.
- Reaction idempotency per `(userId, messageId, emoji)`; capped-embed bound respected.
- Mention resolution: drops non-members/blocked; emits one notification per eligible mention.
- Edit window (author-only) and soft-delete tombstone semantics.
- Block check: DM open/send rejected `BLOCKED` in either direction.

### 8.2 Integration (Nest test module + ephemeral Mongo)
- Send via `chat:message:new`: persisted, `seq` assigned, denorm author identity, broadcast committed message + ack returns the `Message`.
- Idempotency: re-send same envelope `id` → no duplicate write/broadcast, original result returned.
- REST `POST` fallback equals realtime semantics (shared idempotency key).
- Edit/delete: author edit broadcasts `editedAt`; moderator delete tombstones; author cannot edit after window; non-author non-mod delete → `FORBIDDEN`.
- DM lifecycle: `POST /dms` returns existing thread on repeat; send + `notification:new (dm)`; mark-read updates read pointer; blocked pair → `BLOCKED`.
- History pagination: cursor newest-first; `direction=backward` pages older; `deletedAt` filtered.
- Rate limits: `message-send` and `chat:message:new` buckets trip → `RATE_LIMITED`.

### 8.3 End-to-end (web + gateway)
- Two members in a room: A sends, B receives the broadcast in order by `seq`; typing indicator shows then auto-expires.
- Mention pings the mentioned user's `notification:new (mention)` on their self-topic.
- Owner toggles `chatLock` (via rooms) → Member/Guest sends rejected `CHAT_LOCKED`; Owner still sends.
- Reconnect/resume (coordinate with [auth.spec.md](./auth.spec.md) refresh + [rooms.spec.md](./rooms.spec.md) resume): buffered chat frames replay by `seq` with zero duplicates; past the window a snapshot/REST re-page recovers history.
- GIF attachment from an allowlisted host renders for both peers; a disallowed host is rejected on send.

---

## 9. Documentation Requirements

- Keep [docs/EVENTS.md §5.6](../docs/EVENTS.md#56-chat-chat) authoritative for the realtime chat contract and [docs/API.md §3.8](../docs/API.md#38-messages--dms) for REST; this spec links rather than duplicating.
- Document the **GIF host allowlist** and attachment policy in `docs/` + [docs/SECURITY.md](../docs/SECURITY.md) (no SSRF via attachment URLs; sanitize/escape rendered content).
- Cross-link DM eligibility + block semantics to [docs/SOCIAL.md](../docs/SOCIAL.md); confirm friends-only vs. anyone (OQ-C2).
- Confirm `chatLock` Member-suppression with the Chief Architect (shared with [rooms.spec.md OQ-R2](./rooms.spec.md#11-open-questions) / [PERMISSIONS.md OQ-1](../docs/PERMISSIONS.md#9-open-questions-with-recommendations)) and record in `history/decision-ledger.md`.
- Update `context/architecture.md` cross-links if any clarification lands, plus `repomix/` and `project-state/` per the per-feature workflow.

---

## 10. Acceptance Criteria (testable, numbered)

- [ ] **AC-1** A member can send a room message via `chat:message:new`; the server persists it, assigns a per-topic `seq`, denormalizes author identity, broadcasts the committed `Message`, and the ack returns it. *(FR-1, FR-2, FR-17)*
- [ ] **AC-2** Message `body` is validated to 1..4000 chars with exactly one of `roomId`/`threadId`; violations return `VALIDATION_FAILED`. *(FR-3)*
- [ ] **AC-3** GIF attachments are accepted only from an allowlisted host; a disallowed host returns `VALIDATION_FAILED`; the third-party URL is stored (no MinIO re-host in v1). *(FR-4)*
- [ ] **AC-4** Mentions emit one `notification:new (mention)` per channel-readable, non-blocked mentioned user; mentions of non-members/blocked are dropped. *(FR-5)*
- [ ] **AC-5** Edit is author-only within the window (broadcasts `editedAt`); delete is author-or-moderator and produces a soft-delete tombstone filtered from history. *(FR-6, FR-7)*
- [ ] **AC-6** Reactions are a capped embedded array, idempotent per `(userId, messageId, emoji)`, broadcasting the committed `{ count }` delta. *(FR-8)*
- [ ] **AC-7** Typing is ephemeral: never persisted, never acked, throttled, and auto-expires at `expiresAt`. *(FR-9)*
- [ ] **AC-8** With `chatLock=on`, Guest and Member sends are rejected `CHAT_LOCKED` while Owner/Moderator may send; a muted/timed-out member is rejected `MUTED`. *(FR-10, FR-11)*
- [ ] **AC-9** DM threads can be opened/listed; history and mark-read work; a DM between users with a `Block` (either direction) is rejected `BLOCKED`; each DM emits `notification:new (dm)`. *(FR-12, FR-13, FR-14)*
- [ ] **AC-10** History is cursor-paginated newest-first (backward for older) and ordered by per-topic `seq`, not wall-clock `ts`. *(FR-15)*
- [ ] **AC-11** Re-sending a mutating intent with the same envelope `id` (or REST `Idempotency-Key`) causes no duplicate write/broadcast and returns the original result. *(FR-16)*
- [ ] **AC-12** Chat send is rate-limited (`message-send` + `chat:message:new` buckets) with `RATE_LIMITED` on overage; REST and WS enforce the identical permission core; every denial uses the canon error envelope / `system:error` with a propagated `correlationId`; `ChatModule` reaches ≥ 90% coverage. *(FR-18)*

---

## 11. Open Questions

| # | Question | Recommendation |
|---|---|---|
| **OQ-C1** | Does `chatLock=on` suppress Member chat or only Guest? | Suppress **both** Guest and Member (Discord "lock" semantics); shared with [rooms.spec.md OQ-R2](./rooms.spec.md#11-open-questions). Confirm with Chief Architect. |
| **OQ-C2** | DM eligibility — friends-only or anyone (minus blocks)? | **Friends-only by default**, with a per-user "allow DMs from anyone" privacy setting; confirm in [docs/SOCIAL.md](../docs/SOCIAL.md). |
| **OQ-C3** | GIF provider — store third-party URL or re-host to MinIO? | **Store the URL in v1** with a host allowlist ([API.md OQ-5](../docs/API.md#5-open-questions)); revisit MinIO caching if rate limits bite. |
| **OQ-C4** | Edit window duration + edit history retention? | Default **15-minute** edit window; keep only the latest body + `editedAt` flag (no full revision history) for v1. |
| **OQ-C5** | Message search (canon discovery scope) ownership? | Owned by Discovery (Phase 7) reading `messages`; this spec only guarantees the `(roomId/threadId, createdAt)` indexes exist. |

---

### Related documents

- [Architecture Canon](../context/architecture.md) — single source of truth (§1, §4, §5, §6, §10)
- [docs/EVENTS.md §5.6](../docs/EVENTS.md#56-chat-chat) — `chat` realtime contract
- [docs/API.md §3.8](../docs/API.md#38-messages--dms) — REST messages & DMs
- [docs/PERMISSIONS.md](../docs/PERMISSIONS.md) — `send chat` / `chatLock` gating
- [docs/SOCIAL.md](../docs/SOCIAL.md) — DM eligibility, blocks, presence
- [docs/DOMAIN.md](../docs/DOMAIN.md) · [docs/DATABASE.md](../docs/DATABASE.md) — `Message`, `DmThread` entities + schema
- Sibling specs: [auth.spec.md](./auth.spec.md) · [rooms.spec.md](./rooms.spec.md) · [sync.spec.md](./sync.spec.md)
</content>
