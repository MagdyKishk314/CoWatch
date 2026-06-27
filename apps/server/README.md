# apps/server — Cowatch Backend

> One-line purpose: The NestJS backend serving the REST API (`/api/v1`), the WebSocket gateways, authentication, and the server-authoritative playback clock — organized one module per bounded context.

**Status:** Placeholder — Phase 0 (Architecture). **No application code yet** (rule R1: plan before code). This README documents the planned shape of `apps/server`.
**Owner agent:** Backend Engineer
**Last updated: 2026-06-27**

**Canon & cross-links**

- Architecture canon: [../../context/architecture.md](../../context/architecture.md)
- Repository map: [../../INDEX.md](../../INDEX.md)
- Governing docs/ADR: [API](../../docs/API.md) · [AUTH](../../docs/AUTH.md) · [DATABASE](../../docs/DATABASE.md) · [REALTIME](../../docs/REALTIME.md) · [EVENTS](../../docs/EVENTS.md) · [SYNC](../../docs/SYNC.md) · [PERMISSIONS](../../docs/PERMISSIONS.md) · [SECURITY](../../docs/SECURITY.md) · [ADR-002](../../adr/ADR-002-nestjs.md)

---

## Purpose

`apps/server` is the **single backend** for Cowatch. It owns:
- the **REST API** under base `/api/v1` (versioned, plural, resource-nested);
- the **WebSocket gateways** speaking the canonical realtime envelope;
- **authentication & sessions** (JWT access + rotating refresh, OAuth, 2FA) per [ADR-008](../../adr/ADR-008-auth.md);
- the **server-authoritative playback clock** (`PlaybackState`, drift target < 500 ms) per [ADR-007](../../adr/ADR-007-sync.md);
- **persistence** via Prisma over MongoDB and **object storage** via MinIO.

> **Framework rule:** built on **NestJS' own platform** (not Express as an app framework) — see [ADR-002](../../adr/ADR-002-nestjs.md).

## Owning agent

**Backend Engineer** (with Realtime, Media, Voice, and Social Engineers owning their modules).

## Planned tech

| Concern | Choice |
|---|---|
| Framework | NestJS (REST controllers + WS gateways + guards + DI) |
| ORM/DB | Prisma over MongoDB (via [packages/database](../../packages/database/README.md)) |
| Auth | JWT (RS256) access + rotating refresh cookie, TOTP 2FA, OAuth (Google) |
| Realtime | NestJS WS gateways over the [packages/realtime](../../packages/realtime/README.md) envelope |
| Validation | `class-validator` DTOs (`*.dto.ts`) |
| Storage | MinIO (S3-compatible) per [ADR-009](../../adr/ADR-009-minio.md) |
| Voice | LiveKit token/room control per [ADR-005](../../adr/ADR-005-livekit.md) |
| Logging | pino structured JSON; ULID `correlationId` propagation |

## Planned contents

```
apps/server/
  src/
    modules/                 # one module per bounded context (canon §3)
      auth/                  # AuthModule        — login, tokens, sessions, OAuth, 2FA
      users/                 # UsersModule       — profiles, presence ownership
      rooms/                 # RoomsModule       — lifecycle, settings, visibility
      memberships/           # MembershipsModule — roles, mute/ban/timeout
      playlist/              # PlaylistModule    — queue, reorder, votes, skip
      playback/              # PlaybackModule    — authoritative clock + sync
      chat/                  # ChatModule        — messages, reactions, typing
      social/                # SocialModule      — friends, requests, blocks, DMs
      notifications/         # NotificationsModule
      voice/                 # VoiceModule       — LiveKit channels + tokens
      discovery/             # DiscoveryModule   — room list + search
      storage/               # StorageModule     — MinIO signed URLs
      realtime/              # RealtimeModule     — WS gateway plumbing
    common/                  # guards, interceptors, filters, error envelope
    config/                  # env/config loading
    main.ts                  # bootstrap (Nest platform, Helmet, CORS, health)
  test/                      # integration/e2e
```

- File suffixes mandatory: `.module.ts`, `.controller.ts`, `.service.ts`, `.gateway.ts`, `.guard.ts`, `.dto.ts`, `.spec.ts` (canon §3).
- Module ⇄ folder mapping: class `XxxModule` lives in `src/modules/xxx/`.

## Contracts it must honor

- **REST routes** exactly as specified in the canon (`GET /api/v1/rooms`, `POST /api/v1/rooms/:roomId/playlist/items`, `POST /api/v1/auth/refresh`, action segments like `POST /api/v1/rooms/:roomId/ownership/transfer`).
- **Realtime events** named `namespace:entity:action`; server is authoritative for `playback:*` and stamps `serverEpochMs`.
- **Error envelope** and **success envelope** per canon §10; every request/event carries a ULID `correlationId`.
- **Permission model** and **ownership-transfer algorithm** per canon §6 / [PERMISSIONS.md](../../docs/PERMISSIONS.md).

## Which docs/specs govern this app

- **Primary docs:** [API.md](../../docs/API.md), [AUTH.md](../../docs/AUTH.md), [DATABASE.md](../../docs/DATABASE.md), [REALTIME.md](../../docs/REALTIME.md), [EVENTS.md](../../docs/EVENTS.md), [SYNC.md](../../docs/SYNC.md), [PERMISSIONS.md](../../docs/PERMISSIONS.md), [SECURITY.md](../../docs/SECURITY.md), [SOCIAL.md](../../docs/SOCIAL.md), [LIVEKIT.md](../../docs/LIVEKIT.md).
- **ADRs:** [ADR-002](../../adr/ADR-002-nestjs.md), [ADR-003](../../adr/ADR-003-prisma.md), [ADR-004](../../adr/ADR-004-realtime.md), [ADR-007](../../adr/ADR-007-sync.md), [ADR-008](../../adr/ADR-008-auth.md).
- **Specs:** per-feature specs in [../../specs/](../../specs/) (R5).
- **Phases:** the backbone of nearly every phase; the auth/rooms/sync/chat modules land in Phases 1–4, social/notifications/discovery in 5–7, voice/video in 8–9.

## Status notes

Empty of source today. Scaffolding (Nest app, health endpoints, config, error filter) is created at the start of **Phase 1 (Authentication)**.
