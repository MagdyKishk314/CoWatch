# Permissions Context — Cowatch

> One-line purpose: Fast-load digest of the **room-scoped permission model** — roles, the matrix, sync-authority modes, and ownership transfer — pointing to the full design doc.

**Status:** Context digest (Planning — Phase 0)
**Owner agent:** Documentation Engineer
**Last updated: 2026-06-27**

> This is a **condensed context file** for fast restore (R2). It summarizes and **points to** the full design. On any conflict the source wins, in this order: [Architecture Canon §6](./architecture.md#6-permission-model) → [PERMISSIONS.md](../docs/PERMISSIONS.md) → this digest.

---

## TL;DR

Permissions are **room-scoped** and operate on the **`Membership`** (one User ↔ one Room). Four roles in enum `RoomRole`: **`Owner`, `Moderator`, `Member`, `Guest`**. Playback and playlist control are gated per-room by a configurable **sync-authority mode**. Enforcement is **server-side** at both the REST guard layer and the WS gateway edge — clients are never trusted.

## Roles & matrix (essentials)

| Permission | Owner | Moderator | Member | Guest |
|---|:--:|:--:|:--:|:--:|
| kick / ban / mute / timeout | ✓ | ✓ | ✗ | ✗ |
| playback control | ✓ | ◐ | ◐ | ✗ |
| playlist control (add/reorder/remove) | ✓ | ✓ | ◐ | ✗ |
| chat lock / playlist lock (toggle) | ✓ | ✓ | ✗ | ✗ |
| join approval | ✓ | ✓ | ✗ | ✗ |
| change room settings | ✓ | ✗ | ✗ | ✗ |
| assign moderators / transfer ownership | ✓ | ✗ | ✗ | ✗ |
| send chat | ✓ | ✓ | ✓ | ◐ |

`◐` = gated by room config. Full matrix with every cell: [Canon §6](./architecture.md#6-permission-model) / [PERMISSIONS.md](../docs/PERMISSIONS.md).

## Sync-authority modes (`SyncAuthority`)

Per-room, separately configurable for **playback control** and **playlist control**:

- `owner_only` — only the Owner may emit mutating events.
- `owner_moderators` — Owner + Moderators.
- `everyone` — any member.

The server accepts mutating `playback:*` events **only** from members whose effective role satisfies the room's mode; all others receive `system:error` with code **`FORBIDDEN_SYNC`**. Guests' chat is gated by `chatLock`.

## Ownership transfer (on owner disconnect/leave)

1. **Owner reachable** (grace window, default **30 s**) → prompt owner to nominate a successor; transfer on response.
2. Else → transfer to **oldest-joined active Moderator**.
3. Else → transfer to **oldest-joined active Member**.
4. Else (room empty) → `temporary` rooms schedule teardown; `permanent` rooms persist ownerless until a qualifying member returns (then step 2/3 re-runs).

Transfer is **atomic server-side**, emits `room:ownership:transfer` + `notification.new (room.ownership_transfer)`, and re-derives the permission matrix for all members.

## Enforcement substrate

NestJS guards/decorators ([ADR-002](../adr/)) at the REST boundary; identical authority checks at the WS gateway for mutating events ([ADR-004](../adr/) / [ADR-007](../adr/)). The permission unit is always the `Membership`, not the `Session`.

## Boundaries (what permissions does NOT own)

- The transport that carries enforcement decisions → [realtime.md](./realtime.md) / [REALTIME.md](../docs/REALTIME.md)
- The playback drift algorithm itself → [SYNC.md](../docs/SYNC.md)
- Account-level auth, tokens, device sessions → [AUTH.md](../docs/AUTH.md)
- Social-level suppression (blocks) → [social.md](./social.md) / [SOCIAL.md](../docs/SOCIAL.md)

---

## Source documents (read these for detail)

| Topic | Authoritative doc |
|---|---|
| Full permissions design (matrix, enforcement, join approval, moderation) | [../docs/PERMISSIONS.md](../docs/PERMISSIONS.md) |
| Canon — permission model (source of truth) | [./architecture.md#6-permission-model](./architecture.md#6-permission-model) |
| Sync algorithm (authority enforcement on `playback:*`) | [../docs/SYNC.md](../docs/SYNC.md) · [./architecture.md#7-sync-algorithm](./architecture.md#7-sync-algorithm) |
| ADRs | [../adr/](../adr/) (ADR-002, ADR-004, ADR-007) |

## Sibling context digests

[business.md](./business.md) · [realtime.md](./realtime.md) · [social.md](./social.md) · [deployment.md](./deployment.md) · [ui.md](./ui.md) · [RESTORE_CONTEXT.md](./RESTORE_CONTEXT.md)
