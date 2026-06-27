# Social Context — Cowatch

> One-line purpose: Fast-load digest of the **social graph** — friends, presence, activity feed, DMs, notifications, blocks, profiles — pointing to the full design doc.

**Status:** Context digest (Planning — Phase 0)
**Owner agent:** Documentation Engineer
**Last updated: 2026-06-27**

> This is a **condensed context file** for fast restore (R2). It summarizes and **points to** the full design. On any conflict the source wins, in this order: [Architecture Canon](./architecture.md) → [DOMAIN.md](../docs/DOMAIN.md) → [SOCIAL.md](../docs/SOCIAL.md) → this digest.

---

## TL;DR

The social system is what makes Cowatch **Discord-like** rather than a bare watch-sync tool: durable relationships (friends, blocks), realtime presence, a conversational surface outside rooms (DMs), an awareness stream (activity feed), and actionable alerts (notifications) that pull users back in. Six bounded sub-domains, each mapping to an aggregate in the [Domain Model](../docs/DOMAIN.md).

## Sub-domains at a glance

| Sub-domain | Aggregate(s) | Collection(s) (canon §4) |
|---|---|---|
| Friends & friend requests | `Friendship`, `FriendRequest` | `friendships`, `friend_requests` |
| Presence | `User` durable mirror + realtime | `users` |
| Activity feed | `ActivityEvent` | `activity_events` |
| Direct messages | `DmThread`, `Message` | `dm_threads`, `messages` |
| Notifications | `Notification` | `notifications` |
| Blocks | `Block` | `blocks` |
| Profiles & privacy | `User`, profile, privacy | `users` |

## Key decisions (decisive, canon-locked)

- **Friendship is mutual + accepted**; the pending state is a directed **`FriendRequest`**. Canonical events: `social:friend:request`, `social:friend:accept`.
- **Presence** states are `online | idle | dnd | offline` with optional `{ kind: 'room'; roomId }` activity; distributed over the `presence` namespace (`presence:update`). Durable mirror on `users`, authoritative realtime via the transport.
- **Block** is a **directed suppression** (blocker hides/ignores blocked across social surfaces) — distinct from a room-scoped ban (that's [permissions](./permissions.md)).
- **DMs** are channel-scoped `Message`s on a `DmThread`; the same `Message` aggregate is reused for room chat, channel-discriminated.
- **Notification types (seven, canon-fixed):** `friend.online`, `friend.room_started`, `friend.invitation`, `mention`, `dm`, `room.ownership_transfer`, `room.user_joined`. Delivered via `notification:new`.
- **Denormalization** keeps social reads cheap (e.g. `Message.authorDisplayName/authorAvatarUrl`); denorm fields are **eventually consistent** with the owning aggregate as source of truth ([Canon §4](./architecture.md#4-data-modeling-conventions-mongodb--prisma)).

## Boundaries (what social does NOT own)

- Room-scoped role/ban/mute → [permissions.md](./permissions.md) / [PERMISSIONS.md](../docs/PERMISSIONS.md)
- Account/identity/auth → [AUTH.md](../docs/AUTH.md)
- The transport carrying presence/notification frames → [realtime.md](./realtime.md)
- Global search surface (users/rooms/messages/videos/tags) → Discovery (see [PRD](../docs/PRD.md))

---

## Source documents (read these for detail)

| Topic | Authoritative doc |
|---|---|
| Full social design (friends, presence, feed, DMs, notifications, blocks, profiles) | [../docs/SOCIAL.md](../docs/SOCIAL.md) |
| Domain model & aggregates | [../docs/DOMAIN.md](../docs/DOMAIN.md) |
| Notification types & glossary | [./architecture.md#1-glossary-of-core-domain-terms](./architecture.md#1-glossary-of-core-domain-terms) |
| Realtime events (`social`, `presence`, `notification` namespaces) | [../docs/EVENTS.md](../docs/EVENTS.md) |

## Sibling context digests

[business.md](./business.md) · [realtime.md](./realtime.md) · [permissions.md](./permissions.md) · [deployment.md](./deployment.md) · [ui.md](./ui.md) · [RESTORE_CONTEXT.md](./RESTORE_CONTEXT.md)
