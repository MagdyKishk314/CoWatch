# packages/types — Canonical TypeScript Types

> One-line purpose: The **source of truth** for every shared TypeScript type in Cowatch — domain entities, DTOs, and realtime event payloads. Never duplicated elsewhere.

**Status:** Placeholder — Phase 0 (Architecture). **No code yet** (rule R1: plan before code). This README documents the planned shape of `packages/types`.
**Owner agent:** Chief Architect
**Last updated: 2026-06-27**

**Canon & cross-links**

- Architecture canon: [../../context/architecture.md](../../context/architecture.md) (§3 type rules, §4 data model, §5 envelope)
- Repository map: [../../INDEX.md](../../INDEX.md)
- Governing docs: [DOMAIN](../../docs/DOMAIN.md) · [API](../../docs/API.md) · [EVENTS](../../docs/EVENTS.md)

---

## Purpose

`packages/types` is the **single canonical home for cross-app TypeScript types**. Per the canon, shared types live here and are **never duplicated** — the server, SDK, realtime layer, social package, and front-end apps all import the same definitions, so a `Room`, a `CreateRoomDto`, or a `PlaybackSyncEvent` means exactly one thing across the whole codebase. This package is types-only: no runtime logic, no dependencies on framework or persistence.

## Owning agent

**Chief Architect.**

## Planned tech

| Concern | Choice |
|---|---|
| Language | TypeScript declarations only (types/interfaces/enums) |
| Runtime | None — zero runtime footprint |
| Consumers | Every app + package |

## Planned contents

```
packages/types/
  src/
    domain/              # entity interfaces — User, Room, Membership, QueueItem, PlaybackState, Message, ...
    dto/                 # request/response DTOs — CreateRoomDto, ...
    events/              # realtime payloads — PlaybackSyncEvent, RoomMemberJoinPayload, ...
    enums/               # RoomRole, SyncAuthority, ConnectionState, notification types, ...
    index.ts             # barrel
```

## Naming rules it enforces (canon §3)

- **Entity interfaces** in `PascalCase`, **no `I` prefix**, matching the domain term: `User`, `Room`, `Membership`, `QueueItem`, `PlaybackState`, `Message`, `Notification`, `VoiceChannel`, `Friendship`, `FriendRequest`, `Block`, `InviteLink`.
- **DTOs** suffixed `Dto` (`CreateRoomDto`).
- **Realtime payloads** suffixed `Event` / `Payload` (`PlaybackSyncEvent`).
- **Enums** `PascalCase` singular with `PascalCase` members: `RoomRole.Owner`, `SyncAuthority` (`owner_only | owner_moderators | everyone`).
- Ids are **strings** everywhere in TS (never `ObjectId` instances cross the service boundary).

## Relationship to other packages

- [packages/database](../database/README.md) owns *persistence* shapes (Prisma-generated); this package owns the *contract* shapes the API and clients speak. The server maps between them.
- [packages/realtime](../realtime/README.md) envelopes are typed with `data: T` where `T` comes from `events/` here.
- [packages/sdk](../sdk/README.md) and [packages/social](../social/README.md) import from here exclusively for shared shapes.

## Which docs/specs govern this package

- **Primary docs:** [DOMAIN.md](../../docs/DOMAIN.md), [API.md](../../docs/API.md), [EVENTS.md](../../docs/EVENTS.md); canon §§3–5.
- **Specs:** every feature spec introduces or extends types here first ([../../specs/](../../specs/), R5).
- **Phase:** seeded in **Phase 0/1** and extended ahead of each feature — types precede implementation.

## Status notes

Empty today. Because it is the type source of truth, it is populated incrementally just ahead of each feature's code.
