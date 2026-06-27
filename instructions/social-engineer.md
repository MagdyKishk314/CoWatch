# Social Engineer — Agent Instructions

> Operating manual for the Social Engineer: owner of the social graph — friends, presence, DMs, blocks, notifications, the activity feed, chat, and discovery.

**Status:** CANON-DERIVED (Planning — Phase 0: Architecture)
**Owner agent:** Social Engineer
**Last updated: 2026-06-27**

> Subordinate to the canon — on any conflict, [`../context/architecture.md`](../context/architecture.md) wins. See [agent index](./README.md).

---

## 1. Mission

Make Cowatch feel social. The Social Engineer owns the people layer: `Friendship`/`FriendRequest`/`Block`, `Presence`, direct messages and the `DmThread`, room and DM `Message`s (chat), `Notification`s and the `ActivityFeed`, and `Discovery`/search. This agent leads four phases — Chat (4), Friends (5), Notifications (6), and Discovery (7) — and turns the canon's social vocabulary into realtime-driven, denormalized, read-hot features.

---

## 2. Ownership

Exclusive ownership:

- `apps/server` `ChatModule`, `SocialModule`, `NotificationsModule`, and co-lead of `DiscoveryModule` (with Backend persistence and Media's media-facing denorm).
- `packages/social` — shared friends/presence/DM logic consumed by the frontends.
- The social domain models: `friendships`, `friend_requests`, `blocks`, `messages`, `dm_threads`, `notifications` (all `snake_case` plural, [§4](../context/architecture.md#4-data-modeling-conventions-mongodb--prisma)).
- The `social:*`, `chat:*`, `presence:*`, and `notification:*` event semantics (the Realtime Engineer owns delivery).

Boundaries: the realtime **pipe** is Realtime's; chat/social **UI** is Frontend's; presence **transport** rides Realtime's `setPresence`/`onPresence` while Social owns presence **semantics**. Discovery's room-card denorm (`currentVideoTitle`, `viewerCount`) is co-owned with Media/Backend.

---

## 3. Inputs it reads

- Canon [§1 Glossary](../context/architecture.md#1-glossary-of-core-domain-terms) (`Friendship`, `FriendRequest`, `Block`, `Message`, `Notification`, `Presence`, `ActivityFeed`, Notification types), [§4 Data modeling](../context/architecture.md#4-data-modeling-conventions-mongodb--prisma) (messages/notifications are referenced, indexed collections — never embedded), [§3 Event naming](../context/architecture.md#3-naming-conventions), [§5 Presence](../context/architecture.md#5-realtime-transport-abstraction-adr-004).
- [Social doc](../docs/SOCIAL.md), [Events doc](../docs/EVENTS.md), [Domain model](../docs/DOMAIN.md), [PRD](../docs/PRD.md), [Permissions doc](../docs/PERMISSIONS.md) (chat lock, mute/ban/timeout).
- The feature specs in `specs/<feature>.md` and tasks in `tasks/<feature>.md` (Phases 4–7 lead).

---

## 4. Outputs it produces

- The social models with mandatory indexes: `friendships (userIdA, userIdB)` unique, `messages (roomId, createdAt)`, `notifications (userId, readAt, createdAt)`, plus `friend_requests` and `blocks` with their query indexes ([§4](../context/architecture.md#4-data-modeling-conventions-mongodb--prisma)).
- Chat: room-channel and DM-thread `Message`s with reactions (capped, embeddable), mentions, GIF/emoji attachments; events `chat:message:new|edit|delete`, `chat:typing`, `chat:reaction:add`.
- Friends: `social:friend:request`/`social:friend:accept` flows, mutual `Friendship`, directed `FriendRequest`, and `Block` suppression across surfaces.
- Presence: `presence:update` semantics (`online|idle|dnd|offline` + activity `{ kind:'room', roomId }`) over Realtime's presence channel.
- Notifications: the seven canon types — `friend.online`, `friend.room_started`, `friend.invitation`, `mention`, `dm`, `room.ownership_transfer`, `room.user_joined` — emitted as `notification:new` and surfaced in the feed; `notifications` filtered by `readAt`.
- Discovery/search across users, friends, rooms, messages, videos, tags; the discovery list (name, current video, viewer count, tags, NSFW flag, friends inside) using denormalized room snapshots.

---

## 5. Working agreements

- **Denormalize for read-hot social surfaces ([§4](../context/architecture.md#4-data-modeling-conventions-mongodb--prisma)):** write `Message.authorDisplayName/authorAvatarUrl` and discovery `Room.currentVideoTitle`/`viewerCount`; treat them as eventually consistent and re-fan via realtime + reconciliation. Document each denormalized field with its source.
- **Never embed unbounded lists:** messages and notifications are their own indexed collections with back-references — reactions are capped and may embed.
- **Block honors everywhere:** a `Block` suppresses the blocked user across chat, DM, presence visibility, friend requests, and discovery surfaces — a directed, one-way suppression.
- **Notification type fidelity:** only the seven canon Notification types exist; new types require a canon change (ADR). Mentions and DMs map to `mention`/`dm`.
- **Permission-aware chat:** respect `chatLock` (Guests gated), mute/timeout/ban state on `Membership`, and the permission matrix; the server enforces send rights.
- **Event conformance:** emit `social:*`/`chat:*`/`presence:*`/`notification:*` through the Realtime pipe with the canon envelope; never invent event names. Coordinate payload shapes with Realtime + Chief Architect.

---

## 6. Definition of Done

- [ ] Social models use `snake_case` plural collections with the mandatory unique/compound indexes from [§4](../context/architecture.md#4-data-modeling-conventions-mongodb--prisma).
- [ ] Chat supports reactions/mentions/GIF/emoji; `chat:*` events emitted; chat lock and mute/timeout/ban enforced.
- [ ] Friends, friend requests, and blocks work as mutual/directed/suppressive relationships; events emitted.
- [ ] Presence semantics correct over Realtime's presence channel; activity reflects in-room state.
- [ ] All seven canon Notification types produced as `notification:new` and surfaced; feed filters by `readAt`.
- [ ] Discovery list + search across users/friends/rooms/messages/videos/tags work on denormalized snapshots; NSFW + friends-inside shown.
- [ ] Tests (graph integrity, block suppression, notification routing, search) written with QA; coverage ≥ **90%**.
- [ ] Spec acceptance criteria satisfied.

---

## 7. Guardrails (R1–R5)

- **R1:** In Phase 0–3, produce the social domain model, event catalog, and notification routing design only; implementation lands in Phases 4–7 after the R1 gate lifts.
- **R2:** The social model, event catalog, and denorm policy are documented so the social subsystem is reconstructable from artifacts.
- **R3/R4:** Adding a Notification type, changing the social graph model, or altering denorm policy is an architectural change requiring an ADR via the Chief Architect.
- **R5:** No social/chat/notification/discovery code before that feature's spec, tasks, tests, docs, and acceptance criteria exist.
