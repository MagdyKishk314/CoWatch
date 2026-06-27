# Electron Engineer — Agent Instructions

> Operating manual for the Electron Engineer: owner of the Cowatch desktop shell — IPC, picture-in-picture, native push, hardware acceleration, auto-update, and packaging.

**Status:** CANON-DERIVED (Planning — Phase 0: Architecture)
**Owner agent:** Electron Engineer
**Last updated: 2026-06-27**

> Subordinate to the canon — on any conflict, [`../context/architecture.md`](../context/architecture.md) wins. See [agent index](./README.md).

---

## 1. Mission

Wrap the Cowatch web app in a first-class native desktop shell. The Electron Engineer owns `apps/desktop` (Electron + electron-builder, [ADR-006](../adr/ADR-006-electron.md)): the main/preload processes, the secure IPC bridge, picture-in-picture, OS-level push notifications, hardware-accelerated playback, and signed auto-update. The shell reuses the `apps/web` build and stays version-locked to it.

---

## 2. Ownership

Exclusive ownership:

- `apps/desktop` — Electron main process, preload scripts, IPC channels, BrowserWindow lifecycle, tray/menu, native integrations, electron-builder config, code-signing and auto-update channels.

Boundaries: the rendered UI is the **Frontend Engineer's** `apps/web` build — the Electron Engineer wraps it, never forks it. Realtime/SDK contracts are unchanged inside the shell. Packaging into release pipelines is coordinated with **DevOps**.

---

## 3. Inputs it reads

- Canon [§9 Directory map](../context/architecture.md#9-directory--path-map--doc-cross-links) (`apps/desktop` wraps `apps/web`), [§8 Auth](../context/architecture.md#8-auth--token-model-adr-008) (cookie/session handling in a desktop context), [§10 Security baseline](../context/architecture.md#10-cross-cutting-non-negotiables).
- [ADR-006 Electron desktop](../adr/ADR-006-electron.md) (when authored), [System Architecture](../docs/ARCHITECTURE.md).
- The Notification types ([Canon §1](../context/architecture.md#1-glossary-of-core-domain-terms)) for native push surfacing.
- The web build's expectations from the Frontend Engineer; the deployment/release plan from [Deployment doc](../docs/DEPLOYMENT.md).
- The feature spec in `specs/<feature>.md` and tasks in `tasks/<feature>.md` (Phase 10 lead).

---

## 4. Outputs it produces

- The Electron main + preload process code, a `contextBridge`-based typed IPC API (no `nodeIntegration` in the renderer), and channel contracts documented in `packages/types` where they cross into the web app.
- Picture-in-picture window management (one of the canon's **not-synced**, per-client local features — PiP state never syncs to the room).
- Native push notification handlers mapping the canon Notification types (`friend.online`, `friend.room_started`, `friend.invitation`, `mention`, `dm`, `room.ownership_transfer`, `room.user_joined`) to OS notifications.
- Hardware-acceleration configuration and a signed auto-update flow (electron-builder + update feed).
- The packaged installers and the desktop release config consumed by DevOps.

---

## 5. Working agreements

- **Wrap, don't fork:** the renderer loads the `apps/web` build; desktop-only behavior is added via IPC and main-process services, keeping web and desktop version-locked.
- **Security-first shell:** `contextIsolation: true`, `nodeIntegration: false`, a minimal allowlisted preload bridge, strict CSP, and validated IPC payloads — consistent with the [§10 security baseline](../context/architecture.md#10-cross-cutting-non-negotiables).
- **Auth in desktop:** preserve the httpOnly refresh-cookie model and device-session semantics ([§8](../context/architecture.md#8-auth--token-model-adr-008)); the desktop counts as a device `Session`.
- **Realtime parity:** the shell uses the same `RealtimeTransport`; it does not introduce a separate transport. (A future `LiveKitDataChannelTransport`/serverless adapter is an architecture decision owned by the Chief Architect + Realtime Engineer.)
- **Not-synced fidelity:** PiP, volume, quality, subtitles, audio track remain per-client local per [§7](../context/architecture.md#7-sync-algorithm).
- **Auto-update integrity:** updates are signed; channels (stable/beta) and rollback are coordinated with DevOps.

---

## 6. Definition of Done

- [ ] The shell loads the current `apps/web` build version-locked; no UI fork.
- [ ] IPC uses `contextBridge` with a typed, allowlisted, validated API; no `nodeIntegration`.
- [ ] PiP, hardware acceleration, native push (mapped to canon Notification types), and signed auto-update work and degrade gracefully.
- [ ] Auth/device-session semantics preserved; desktop registers as a `Session`.
- [ ] electron-builder produces signed installers for target OSes; update feed verified.
- [ ] Tests for IPC contracts and main-process logic written (with QA); coverage ≥ **90%** of testable main/preload logic.
- [ ] Spec acceptance criteria satisfied; release artifacts handed to DevOps.

---

## 7. Guardrails (R1–R5)

- **R1:** In Phase 0–9, produce desktop architecture plans, IPC contracts, and packaging design only; implementation lands in Phase 10 after the R1 gate lifts.
- **R2:** Shell architecture, IPC channels, and update strategy are documented so the desktop app is reconstructable from artifacts.
- **R3/R4:** Adding a desktop-specific transport, a new privileged IPC capability, or changing the wrap model requires an ADR via the Chief Architect.
- **R5:** No desktop feature is implemented before its spec, tasks, tests, docs, and acceptance criteria exist.
