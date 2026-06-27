# apps/desktop — Cowatch Desktop Application

> One-line purpose: The Electron desktop shell that wraps `apps/web`, adding native capabilities — picture-in-picture, OS push notifications, hardware acceleration, auto-update, and IPC.

**Status:** Placeholder — Phase 0 (Architecture). **No application code yet** (rule R1: plan before code). This README documents the planned shape of `apps/desktop`.
**Owner agent:** Electron Engineer
**Last updated: 2026-06-27**

**Canon & cross-links**

- Architecture canon: [../../context/architecture.md](../../context/architecture.md)
- Repository map: [../../INDEX.md](../../INDEX.md)
- Governing docs/ADR: [ADR-006 (Electron)](../../adr/ADR-006-electron.md) · [UI](../../docs/UI.md) · [REALTIME](../../docs/REALTIME.md) · [SECURITY](../../docs/SECURITY.md)

---

## Purpose

`apps/desktop` is the **native shell** for Cowatch on Windows, macOS, and Linux. It **reuses the web app** ([apps/web](../web/README.md)) as its renderer rather than re-implementing UI, and layers in OS-native features that a browser cannot provide: floating picture-in-picture of the player, native OS push notifications, hardware-accelerated video, background presence, and seamless auto-update. The boundary between privileged main-process capabilities and the renderer is mediated by a strict, allowlisted **IPC** surface.

## Owning agent

**Electron Engineer.**

## Planned tech

| Concern | Choice |
|---|---|
| Shell | Electron |
| Packaging/updates | electron-builder (auto-update) |
| Renderer | `apps/web` build, loaded into a hardened `BrowserWindow` |
| Native bridge | Context-isolated `preload` exposing a typed, allowlisted IPC API |
| Native features | Picture-in-picture, OS push notifications, HW accel, deep links |
| Shared types | [packages/types](../../packages/types/README.md) (for the IPC contract) |

## Planned contents

```
apps/desktop/
  src/
    main/                # main process: window lifecycle, auto-update, tray, deep links
    preload/             # context-isolated bridge (typed IPC surface)
    ipc/                 # IPC channel definitions + handlers (typed via packages/types)
    features/
      pip/               # picture-in-picture window management
      notifications/     # native push -> OS notifications
      updater/           # electron-builder auto-update flow
  electron-builder.yml   # packaging + publish config
  package.json
```

- Source files: `kebab-case.ts` (canon §3).
- The IPC contract is defined as TypeScript types in [packages/types](../../packages/types/README.md) so main, preload, and renderer share one source of truth.

## Native capabilities (planned)

| Capability | Notes |
|---|---|
| Picture-in-picture | Detachable always-on-top player window mirroring server-synced playback state. |
| Push notifications | Social/room notifications surfaced via the OS (`friend.online`, `dm`, `mention`, `room.*`). |
| Hardware acceleration | GPU-accelerated video decode for smooth high-resolution playback. |
| Auto-update | electron-builder differential updates with signed releases. |
| IPC | Least-privilege, context-isolated bridge — no `nodeIntegration` in the renderer. |

## Security posture (planned)

Per [SECURITY.md](../../docs/SECURITY.md) and [ADR-006](../../adr/ADR-006-electron.md): `contextIsolation: true`, `nodeIntegration: false`, a minimal preload allowlist, strict CSP, and signed auto-update artifacts. The renderer never gets raw Node access.

## Which docs/specs govern this app

- **Primary:** [ADR-006](../../adr/ADR-006-electron.md) (the decision and constraints), [UI.md](../../docs/UI.md) (the reused renderer), [SECURITY.md](../../docs/SECURITY.md) (hardening), [REALTIME.md](../../docs/REALTIME.md) (background presence/connection behavior).
- **Specs:** desktop-specific specs in [../../specs/](../../specs/) (authored before build, R5).
- **Phase:** primarily **Phase 10 (Electron)**, after the web app surfaces are stable.

## Status notes

Empty of source today. Work begins in **Phase 10**, reusing the then-mature `apps/web` build.
