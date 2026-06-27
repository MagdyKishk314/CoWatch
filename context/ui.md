# UI Context — Cowatch

> One-line purpose: Fast-load digest of the **client/UI domain** — the web + desktop stack, surfaces, and conventions — pointing to the full design docs.

**Status:** Context digest (Planning — Phase 0)
**Owner agent:** Documentation Engineer
**Last updated: 2026-06-27**

> This is a **condensed context file** for fast restore (R2). It summarizes and **points to** the full design. On any conflict the source wins, in this order: [Architecture Canon](./architecture.md) → [PRD](../docs/PRD.md) / [ARCHITECTURE.md](../docs/ARCHITECTURE.md) → this digest.
>
> **Doc home:** the detailed UI/frontend design doc is **`docs/UI.md` (pending — to be authored in the Frontend planning pass)**. Until it lands, the authoritative UI references are the **container/app sections of [ARCHITECTURE.md](../docs/ARCHITECTURE.md)**, the **product surfaces in [PRD.md](../docs/PRD.md)**, and **Canon §9** (path map / stack).

---

## TL;DR

Cowatch ships **three client surfaces**: a responsive **web app** (`apps/web`), a native **Electron desktop app** (`apps/desktop`) that wraps the web app, and a **marketing landing site** (`apps/landing`). Shared, reusable UI lives in **`packages/ui`** (shadcn/Radix components) so web and desktop never diverge visually.

## Stack (canon-locked, [Canon §9](./architecture.md#9-directory--path-map--doc-cross-links))

| Surface | Stack |
|---|---|
| `apps/web` | React + **Vite** + **TailwindCSS** + **shadcn/ui** + **Radix UI** + **Framer Motion** + **Zustand** (client state) + **TanStack Query** (server state) |
| `apps/desktop` | **Electron + electron-builder** wrapping the web app — PiP, OS push notifications, hardware acceleration, auto-update, IPC ([ADR-006](../adr/)) |
| `apps/landing` | Marketing site |
| `packages/ui` | Shared shadcn/Radix component library (single visual source) |

## Naming conventions (canon §3, UI-relevant)

- React components → **`PascalCase.tsx`**; hooks → **`useCamelCase.ts`**; Zustand stores → **`camelCase.store.ts`**.
- Typed API access goes through **`packages/sdk`** (consumes canonical types from **`packages/types`** — never duplicated).
- The UI talks to realtime only through the **`RealtimeTransport` interface** in `packages/realtime` — it is **unaware** of the concrete transport ([realtime.md](./realtime.md)).

## Primary UI surfaces (product-level, see [PRD](../docs/PRD.md))

Auth/onboarding (incl. guest + upgrade); room shell (synced player, playlist/queue with drag-reorder + voting, chat with reactions/GIFs/mentions/typing, voice/video/screen-share panel); social surfaces (friends list, presence, DMs, notification feed, profiles); discovery/search (browse public rooms by name/current video/viewer count/tags/NSFW/friends-inside; global search). Desktop adds PiP + OS push.

## State & data conventions

- **Server state** → TanStack Query (fetch/cache/invalidate); **client/UI state** → Zustand stores.
- **Realtime-driven UI** subscribes to namespaced events (`playback:*`, `chat:*`, `presence:*`, `notification:new`, …) via the transport and reconciles against query caches.
- **Local-only player settings** (volume, subtitles, audio track, quality, PiP) are **never synced** — per [Canon §7](./architecture.md#7-sync-algorithm).

## Boundaries (what UI does NOT own)

- Server-authoritative playback/clock → [SYNC.md](../docs/SYNC.md)
- Permission gating (what controls render enabled/disabled) is **derived from** server authority → [permissions.md](./permissions.md)
- Realtime transport mechanics → [realtime.md](./realtime.md)
- Voice/video media plane (LiveKit) → [LIVEKIT.md](../docs/LIVEKIT.md)

---

## Source documents (read these for detail)

| Topic | Authoritative doc |
|---|---|
| Detailed UI/frontend design | **`docs/UI.md`** — *pending (Frontend planning pass)* |
| Container/app architecture (web, desktop, landing, packages) | [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) |
| Product surfaces, personas, user stories | [../docs/PRD.md](../docs/PRD.md) |
| Stack & path map (source of truth) | [./architecture.md#9-directory--path-map--doc-cross-links](./architecture.md#9-directory--path-map--doc-cross-links) |

## Sibling context digests

[business.md](./business.md) · [realtime.md](./realtime.md) · [permissions.md](./permissions.md) · [social.md](./social.md) · [deployment.md](./deployment.md) · [RESTORE_CONTEXT.md](./RESTORE_CONTEXT.md)
