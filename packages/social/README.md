# packages/social — Social Domain Logic

> One-line purpose: Shared friends / presence / direct-message / notification domain logic reused by both the server and the front-end clients.

**Status:** Placeholder — Phase 0 (Architecture). **No code yet** (rule R1: plan before code). This README documents the planned shape of `packages/social`.
**Owner agent:** Social Engineer
**Last updated: 2026-06-27**

**Canon & cross-links**

- Architecture canon: [../../context/architecture.md](../../context/architecture.md)
- Repository map: [../../INDEX.md](../../INDEX.md)
- Governing docs: [SOCIAL](../../docs/SOCIAL.md) · [REALTIME](../../docs/REALTIME.md) · [EVENTS](../../docs/EVENTS.md)

---

## Purpose

`packages/social` holds the **portable social-graph logic** that both [apps/server](../../apps/server/README.md) and [apps/web](../../apps/web/README.md) need to behave identically: friendship/request state transitions, block-suppression rules, presence derivation (`online` / `idle` / `dnd` / `offline` + activity), DM-thread keying, activity-feed shaping, and notification-type construction. Putting these rules in one package prevents the client and server from drifting apart on, e.g., what a valid friend-request transition is or how a block hides a user across surfaces.

## Owning agent

**Social Engineer.**

## Planned tech

| Concern | Choice |
|---|---|
| Language | TypeScript (framework-agnostic, no React/Nest coupling) |
| Realtime | Consumes [packages/realtime](../realtime/README.md) event types (`social:*`, `presence:*`, `notification:*`) |
| Types | [packages/types](../types/README.md) for `Friendship`, `FriendRequest`, `Block`, `PresenceState`, `Notification` |

## Planned contents

```
packages/social/
  src/
    friends/             # friendship + request state machine, validation
    presence/            # presence derivation + activity shaping
    dm/                  # DM thread keying, ordering, read state
    blocks/              # block suppression rules across surfaces
    notifications/       # notification-type builders (canon notification types)
    feed/                # activity-feed assembly
    index.ts             # barrel
```

- File naming `kebab-case.ts` (canon §3). No persistence here — storage lives in [packages/database](../database/README.md) and the server's `SocialModule`.

## Contracts it must honor

- **Notification types** exactly as canon defines: `friend.online`, `friend.room_started`, `friend.invitation`, `mention`, `dm`, `room.ownership_transfer`, `room.user_joined`.
- **Presence statuses** `online | idle | dnd | offline` with optional in-room activity (canon §5 `PresenceState`).
- **Friendship/Block semantics:** `Friendship` is mutual+accepted; `FriendRequest` is directed+pending; `Block` is directed suppression (canon §1).

## Which docs/specs govern this package

- **Primary docs:** [SOCIAL.md](../../docs/SOCIAL.md), [REALTIME.md](../../docs/REALTIME.md), [EVENTS.md](../../docs/EVENTS.md).
- **Specs:** the social spec in [../../specs/](../../specs/) (R5).
- **Phase:** **Phase 5 (Friends)** and **Phase 6 (Notifications)**.

## Status notes

Empty today. Built in Phases 5–6 once auth and rooms exist.
