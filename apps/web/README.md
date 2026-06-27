# apps/web — Cowatch Web Application

> One-line purpose: The primary Cowatch client — a React SPA where users discover/create rooms, watch synchronized media, chat, talk over voice/video, and manage their social graph.

**Status:** Placeholder — Phase 0 (Architecture). **No application code yet** (rule R1: plan before code). This README documents the planned shape of `apps/web`.
**Owner agent:** Frontend Engineer
**Last updated: 2026-06-27**

**Canon & cross-links**

- Architecture canon: [../../context/architecture.md](../../context/architecture.md)
- Repository map: [../../INDEX.md](../../INDEX.md)
- Governing docs: [UI](../../docs/UI.md) · [API](../../docs/API.md) · [REALTIME](../../docs/REALTIME.md) · [EVENTS](../../docs/EVENTS.md) · [SYNC](../../docs/SYNC.md) · [SOCIAL](../../docs/SOCIAL.md) · [LIVEKIT](../../docs/LIVEKIT.md) · [AUTH](../../docs/AUTH.md)

---

## Purpose

`apps/web` is the user-facing browser application and the single front-end implementation that `apps/desktop` (Electron) also wraps. It renders every product surface: authentication, discovery, room (player + playlist + chat + voice), friends/presence/DMs, notifications, profile, and settings. It is **server-authoritative for playback** — it never trusts peer clients and reconciles to `playback:sync` snapshots from the server.

## Owning agent

**Frontend Engineer** (with the Social, Media, and Voice Engineers contributing their respective surfaces).

## Planned tech

| Concern | Choice |
|---|---|
| Framework | React + TypeScript |
| Build/dev | Vite |
| Styling | TailwindCSS |
| Components | shadcn/ui + Radix UI (via [packages/ui](../../packages/ui/README.md)) |
| Animation | Framer Motion |
| Client state | Zustand (`*.store.ts`) |
| Server state | TanStack Query |
| API access | [packages/sdk](../../packages/sdk/README.md) (typed client over [packages/types](../../packages/types/README.md)) |
| Realtime | [packages/realtime](../../packages/realtime/README.md) `RealtimeTransport` (default `NativeWsTransport`) |
| Auth | [packages/auth](../../packages/auth/README.md) token/session helpers (ADR-008) |
| Voice/video | LiveKit client SDK (per [ADR-005](../../adr/ADR-005-livekit.md)) |

## Planned contents

```
apps/web/
  src/
    app/                 # router, providers, layout shells
    features/            # one folder per domain surface
      auth/              # login, register, OAuth, 2FA, password reset
      discovery/         # room list, search, tags, NSFW filter, friends-inside
      room/              # player, playlist/queue, sync UI, chat, voice tray
      social/            # friends, requests, presence, DMs, blocks, activity feed
      notifications/     # notification feed + toasts
      profile/           # user profiles, settings, device sessions
    components/          # app-local composites (shared primitives live in packages/ui)
    stores/              # Zustand stores (camelCase.store.ts)
    hooks/               # useCamelCase.ts
    lib/                 # client config, query client, realtime wiring
  index.html
  vite.config.ts
```

- React components: `PascalCase.tsx`; hooks: `useCamelCase.ts`; stores: `camelCase.store.ts` (canon §3).
- One feature folder per domain; cross-app types come from `packages/types` only.

## Which docs/specs govern this app

- **Primary docs:** [UI.md](../../docs/UI.md) (screens, components, state), [SYNC.md](../../docs/SYNC.md) (client-side drift correction), [REALTIME.md](../../docs/REALTIME.md) + [EVENTS.md](../../docs/EVENTS.md) (subscriptions), [SOCIAL.md](../../docs/SOCIAL.md), [LIVEKIT.md](../../docs/LIVEKIT.md), [AUTH.md](../../docs/AUTH.md), [API.md](../../docs/API.md).
- **Specs:** per-feature specs in [../../specs/](../../specs/) (to be authored before each feature is built, R5).
- **Phases:** built incrementally across Phases 1–10 (Auth → Rooms → Sync → Chat → Friends → Notifications → Discovery → Voice → Video → Electron).

## Status notes

This directory is intentionally empty of source today. Scaffolding (Vite app, Tailwind, router, providers) is created at the start of **Phase 1 (Authentication)** once the auth spec, tasks, and tests exist.
