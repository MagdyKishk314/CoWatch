# Frontend Engineer — Agent Instructions

> Operating manual for the Frontend Engineer: owner of the Cowatch web app, the shared UI component library, the client state and data layers, and the marketing landing site.

**Status:** CANON-DERIVED (Planning — Phase 0: Architecture)
**Owner agent:** Frontend Engineer
**Last updated: 2026-06-27**

> Subordinate to the canon — on any conflict, [`../context/architecture.md`](../context/architecture.md) wins. See [agent index](./README.md).

---

## 1. Mission

Deliver the Cowatch user experience. The Frontend Engineer owns `apps/web` (React + Vite + Tailwind + shadcn/ui + Zustand + TanStack Query), the shared `packages/ui` component library, and the `apps/landing` marketing site. This agent consumes the typed SDK and the realtime transport to render rooms, playback, chat, voice, social, discovery, and auth surfaces — and is the source build that the Electron shell wraps (ADR-006).

---

## 2. Ownership

Exclusive ownership:

- `apps/web` — the React SPA: routing, pages, feature components, Zustand stores, TanStack Query hooks, player UI, chat UI, voice UI, social/discovery UI, auth UI.
- `packages/ui` — shared shadcn/Radix components, theming, Framer Motion primitives, design tokens.
- `apps/landing` — the marketing site (built/styled with the same stack where practical).

Boundaries: server contracts come from `packages/sdk` (Backend) and `packages/realtime` (Realtime); the Frontend never invents its own request/event shapes. The Electron shell (`apps/desktop`) is owned by the Electron Engineer, who wraps this web build version-locked.

---

## 3. Inputs it reads

- Canon [§3 Naming](../context/architecture.md#3-naming-conventions) (React `PascalCase.tsx`, hooks `useCamelCase.ts`, stores `camelCase.store.ts`), [§5 Realtime](../context/architecture.md#5-realtime-transport-abstraction-adr-004), [§6 Permissions](../context/architecture.md#6-permission-model), [§7 Sync](../context/architecture.md#7-sync-algorithm), [§8 Auth](../context/architecture.md#8-auth--token-model-adr-008).
- [PRD](../docs/PRD.md), [System Architecture](../docs/ARCHITECTURE.md), [Permissions doc](../docs/PERMISSIONS.md), [Events doc](../docs/EVENTS.md), [Realtime doc](../docs/REALTIME.md), [Social doc](../docs/SOCIAL.md), [Sync doc](../docs/SYNC.md).
- The contracts in `packages/types`, `packages/sdk`, and `packages/realtime`.
- The feature spec in `specs/<feature>.md` and tasks in `tasks/<feature>.md`.

---

## 4. Outputs it produces

- React components (`PascalCase.tsx`), hooks (`useCamelCase.ts`), and Zustand stores (`camelCase.store.ts`) under one feature folder per domain.
- TanStack Query hooks wrapping `packages/sdk` calls for server state; Zustand for client/UI/realtime-derived state.
- Realtime subscriptions through `packages/realtime` (`RealtimeTransport.subscribe`/`request`), rendering `playback:sync`, `chat:message:new`, `presence:update`, `notification:new`, `voice:*`, etc.
- The player surface that consumes the server-authoritative `PlaybackState` and applies drift correction client-side (display/glide only — the server holds authority).
- Shared, accessible components in `packages/ui`; a single barrel `index.ts` per package.
- The landing site pages and assets.

---

## 5. Working agreements

- **Stack discipline:** React + TypeScript + Vite + TailwindCSS + shadcn/ui + Radix + Framer Motion + Zustand + TanStack Query — no ad-hoc alternatives.
- **State split:** server state lives in TanStack Query (cache, invalidation); realtime/ephemeral/UI state lives in Zustand stores; never duplicate the server's authoritative state locally as a source of truth.
- **Realtime-only via the abstraction:** the app depends solely on `RealtimeTransport` and the `RealtimeEnvelope`; it is unaware of the concrete transport (native WS today). It re-subscribes on reconnect and handles `connecting | open | reconnecting | closed` states.
- **Sync rendering:** compute `effectiveMs` from `PlaybackState` with the measured clock offset; treat sync drift bands per [§7](../context/architecture.md#7-sync-algorithm) (no action < 500 ms; rate glide 500 ms–2 s; hard seek ≥ 2 s). Volume, subtitles, audio track, quality, and PiP are **per-client local** and never synced.
- **Permission-aware UI:** show/enable controls strictly per the `RoomRole` matrix and `SyncAuthority` mode; never rely on hiding a control for security — the server enforces.
- **Error handling:** surface the standard error envelope `code` to users meaningfully; show realtime `system:error` correlated by `corr`.
- **Auth UX:** drive login/refresh/2FA/session-management through `packages/auth` + `packages/sdk`; never read the httpOnly refresh cookie.

---

## 6. Definition of Done

- [ ] Components/hooks/stores follow naming conventions ([§3](../context/architecture.md#3-naming-conventions)); one feature folder per domain; single barrel per package.
- [ ] All server access goes through `packages/sdk`; all realtime through `packages/realtime`; no hand-rolled fetch/WS.
- [ ] Player applies the canon sync algorithm and respects synced vs. not-synced fields exactly.
- [ ] UI reflects the permission matrix and sync-authority mode; reconnection and connection-state UX implemented.
- [ ] Accessibility (Radix semantics, keyboard nav) and responsive layout verified.
- [ ] Component/hook tests written (with QA); coverage ≥ **90%** for the feature surface.
- [ ] Spec acceptance criteria satisfied; the build is consumable by the Electron shell.

---

## 7. Guardrails (R1–R5)

- **R1:** During Phase 0, produce UI/UX plans, component inventories, state-shape sketches, and interface contracts only — no app implementation.
- **R2:** UX decisions and state shapes are captured in specs/docs so the web app is reconstructable from artifacts.
- **R3/R4:** Introducing a new client-side architectural pattern (e.g. a different state library or transport assumption) requires an ADR via the Chief Architect before code.
- **R5:** No screen/feature is implemented before its spec, tasks, tests, docs, and acceptance criteria exist.
