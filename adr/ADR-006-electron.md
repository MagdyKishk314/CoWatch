# ADR-006 — Electron + electron-builder for the desktop app

> Ship the Cowatch desktop client as an **Electron** application packaged with **electron-builder**, wrapping the existing `apps/web` React app inside a native shell to deliver picture-in-picture, OS push notifications, hardware-accelerated playback, auto-update, and IPC.

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-06-27 |
| **Deciders** | Chief Architect (owner), Electron Engineer, Frontend Engineer, DevOps Engineer |
| **Related ADRs** | [ADR-001 — Turborepo + pnpm](./ADR-001-monorepo.md), [ADR-004 — Realtime abstraction](./ADR-004-realtime.md), [ADR-005 — LiveKit voice/video](./ADR-005-livekit.md), [ADR-008 — Auth & token model](./ADR-008-auth-tokens.md), [ADR-010 — Docker-first delivery](./ADR-010-docker.md) |
| **Canon** | [Architecture Canon §2 (ADR-006)](../context/architecture.md#2-canonical-architecture-decisions-one-line--adr-id), [§9 Directory / Path Map](../context/architecture.md#9-directory--path-map--doc-cross-links), [§8 Auth / Token Model](../context/architecture.md#8-auth--token-model-adr-008) |
| **Supersedes** | — |
| **Last updated** | 2026-06-27 |

---

## Context / Problem

Cowatch is a Discord-like watch-party SaaS shipping on **two interactive surfaces** — a web app and a **desktop app** — plus a marketing landing site (SPEC: PLATFORMS). The canon ([§9](../context/architecture.md#9-directory--path-map--doc-cross-links)) fixes the desktop app at `apps/desktop` and describes it as **"Electron + electron-builder (wraps web)"**, and the SPEC names the exact desktop capabilities the product depends on:

- **Picture-in-picture (PiP)** — a detached, always-on-top video window so users keep watching while they browse, chat, or use other apps. This is a headline feature for a watch-party product.
- **Push notifications** — native OS notifications for the canon notification types (`friend.online`, `friend.room_started`, `friend.invitation`, `mention`, `dm`, `room.ownership_transfer`, `room.user_joined`) delivered even when the window is unfocused or minimized.
- **Hardware acceleration** — GPU-accelerated video decode/compositing for smooth synchronized YouTube playback (ADR-007 sync, drift target < 500 ms) and LiveKit voice/video/screen-share (ADR-005).
- **Auto-update** — silent, signed background updates so a SaaS desktop fleet stays current without manual reinstalls.
- **IPC** — a privileged main-process bridge for OS integration (tray, global shortcuts, deep links, file dialogs, PiP window management) exposed safely to the renderer.

The engineering constraint is **reuse, not rebuild**: the canon's `apps/web` (React + Vite + Tailwind + shadcn/ui + Zustand + TanStack Query) is the single UI implementation. The desktop app must **wrap that web app**, sharing the same `packages/{ui,sdk,realtime,auth,social,types,shared}` and the same [realtime envelope/transport](../context/architecture.md#5-realtime-transport-abstraction-adr-004) — not fork a second UI. Everything must also build and ship **Docker-first** for the build/CI pipeline (ADR-010) and live in the **Turborepo** task graph (ADR-001).

The decision is which **desktop shell technology** hosts the web app and provides the five native capabilities above. This is foundational and expensive to reverse: it dictates the desktop build toolchain, the native integration surface (IPC contract), the update channel, code-signing/notarization, and the renderer↔main security boundary that every desktop-only feature depends on.

---

## Options Considered

### Option A — Electron + electron-builder *(chosen)*

A Chromium renderer + Node.js main process bundled per-platform with `electron-builder`. The renderer loads the **same** `apps/web` build; native capabilities live in the main process and are exposed to the renderer through a hardened `contextBridge` preload IPC API.

- **Pros:** **First-class, complete coverage** of all five required capabilities — PiP via Chromium's Document/Video Picture-in-Picture plus detachable `BrowserWindow`; OS push via `Notification` + a background-running main process; GPU acceleration on the bundled Chromium; mature **auto-update** (`electron-updater`) with delta updates and signed feeds; a well-defined **IPC** model (`ipcMain`/`ipcRenderer` + `contextBridge`). Renderer is literally the `apps/web` bundle, so **maximum UI reuse** and identical realtime/SDK/auth code. **Bundled, pinned Chromium** ⇒ deterministic rendering of synced video across all desktop installs (no host-WebView variance). Largest desktop ecosystem and documentation; the Electron Engineer role (SPEC) is staffed around it. Directly satisfies the canon's stated `apps/desktop` shape.
- **Cons:** **Large binaries** (~80–150 MB) and higher RAM than native — each app ships its own Chromium + Node. Broad attack surface demands disciplined hardening (`contextIsolation`, `sandbox`, disabled `nodeIntegration`, strict CSP). Auto-update needs **code signing + Apple notarization** (cost + ops). Slower cold start than native; security patch cadence is tied to chasing Chromium/Electron releases.

### Option B — Tauri (Rust core + OS WebView)

A Rust main process hosting the OS-native WebView (WebView2 on Windows, WKWebView on macOS, WebKitGTK on Linux), with a small JS↔Rust IPC bridge.

- **Pros:** **Tiny bundles** (~3–10 MB) and low memory — no bundled browser; strong security posture and capability-scoped IPC by default; fast startup; Rust core is efficient. Can still load `apps/web`.
- **Cons:** **Renders on the host's WebView**, so video/codec/GPU behavior **varies per OS and per machine version** — unacceptable risk for a product whose core promise is **deterministic, <500 ms-drift synchronized playback** across clients (ADR-007). **PiP, background push, and HW-accel behavior diverge** across WebView engines and are not uniformly available; LiveKit (ADR-005) WebRTC support and screen-share permissions differ across WebKitGTK/WebView2. Native integration requires **Rust** — a language outside the team's TS-centric stack (ADR-001/002), raising the bar for the Electron Engineer role. Smaller ecosystem; auto-update less turnkey than `electron-updater`. The cross-WebView matrix multiplies QA cost against the 90% coverage target.

### Option C — PWA-only (installable web app, no native shell)

Ship the web app as an installable Progressive Web App; rely on browser/OS PWA capabilities (service worker, Web Push, install prompt).

- **Pros:** **Zero extra build artifact** — one codebase, no packaging, no signing, no desktop binary; instant updates (just deploy the web app); smallest maintenance surface; no Chromium to bundle.
- **Cons:** **Cannot meet the required capability set.** PiP is limited to in-page Document PiP with inconsistent browser support and **no true always-on-top detached window**; **Web Push is unreliable/absent** for desktop background delivery (notably weak on macOS/Safari and gated when the PWA is closed); **no real auto-update channel** beyond cache busting; **no privileged IPC / OS integration** (tray, global shortcuts, deep-link protocol handler, file dialogs); HW-accel and screen-share are at the host browser's mercy. Fails the SPEC's explicit desktop feature list and the canon's `apps/desktop` mandate.

### Option D — Native per-OS apps (Swift/AppKit, WinUI/C#, GTK)

Hand-build a native desktop client per platform, embedding a WebView or a native UI, with a native realtime/media layer.

- **Pros:** **Best performance, smallest footprint, deepest OS integration**, native PiP/notifications/HW-accel by definition; smallest per-app attack surface.
- **Cons:** **3× the UI work** in three languages/toolkits — abandons the canon's single `apps/web` React UI and all of `packages/{ui,sdk,realtime,...}` reuse; re-implements the realtime transport, sync algorithm, and LiveKit integration per platform; vastly larger team, timeline, and maintenance; impossible to keep in lockstep with the web app's feature velocity across 13 development phases; contradicts the monorepo "one atomic versioned codebase" rationale (ADR-001). Wildly over budget for a founding-team SaaS.

> Options A and B are **web-reusing shells**; C is **shell-less**; D **abandons reuse**. The decision weighs **capability completeness + rendering determinism** (A) against **footprint/security** (B) against **zero-maintenance** (C) against **native depth** (D). For a product whose differentiator is *synchronized* playback, rendering determinism and full native capability coverage dominate.

---

## Decision

**Adopt Electron + electron-builder (Option A)** for `apps/desktop`. The Electron renderer loads the **same `apps/web` build** — the desktop app is a native shell around the one React UI, never a second UI implementation. All native capability lives in the **main process** and is exposed to the renderer through a single, hardened, typed **preload IPC bridge** (`contextBridge`). The app builds inside the Turborepo task graph (ADR-001) and packages reproducibly in Docker/CI (ADR-010).

**Binding constraints (house rules for `apps/desktop`):**

- **Renderer = `apps/web`.** No forked UI. The desktop app sets a desktop runtime flag so the shared UI can light up desktop-only affordances (PiP button, tray, native notifications) via feature detection, while all business logic, realtime ([§5](../context/architecture.md#5-realtime-transport-abstraction-adr-004)), SDK, and auth ([§8](../context/architecture.md#8-auth--token-model-adr-008)) stay in shared packages.
- **Security hardening is non-negotiable** (canon §10): `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webSecurity: true`, a strict **CSP**, `setWindowOpenHandler` to block arbitrary windows, and navigation locked to the app origin + allowlisted hosts (YouTube, LiveKit, MinIO signed URLs, the API origin). The renderer **never** gets raw Node/`require`.
- **Single typed IPC surface.** All renderer↔main calls go through one preload-exposed API object (`window.cowatch`), backed by typed channel contracts living in `packages/types`. No ad-hoc `ipcRenderer.send` from the renderer; channels are an explicit, reviewed contract.
- **Auth on desktop** follows ADR-008 unchanged: short-lived JWT access tokens in memory; the **rotating refresh token** is delivered as an httpOnly cookie to the desktop session's persistent partition (the refresh endpoint is scoped to `/api/v1/auth`), with reuse-detection and device-session semantics identical to web. The desktop install registers as its own **device `Session`** (label e.g. "Cowatch Desktop · Windows").
- **Auto-update** uses `electron-updater` against a signed update feed; updates are checked in the background and applied on restart, gated behind code signing (Windows) + notarization (macOS).
- **PiP** uses Chromium Document/Video Picture-in-Picture for the in-OS floating player, with a detachable always-on-top `BrowserWindow` fallback for richer controls; PiP is **local-only** per the sync algorithm — it is in the canon's **NOT synced** list ([§7](../context/architecture.md#7-sync-algorithm)), so entering/leaving PiP never emits `playback:*` events.
- **Notifications** map canon `Notification` types ([§1](../context/architecture.md#1-glossary-of-core-domain-terms)) to native OS notifications via main-process `Notification`, fed by the realtime `notification:new` event over the shared transport; clicking deep-links into the relevant room/DM.

Illustrative contracts (definitions only — **not** an implementation):

```ts
// packages/types — desktop IPC channel contract (renderer <-> main)
export interface DesktopBridge {
  // capability discovery (renderer feature-detects desktop affordances)
  getPlatformInfo(): Promise<{ os: 'win32' | 'darwin' | 'linux'; appVersion: string; isDesktop: true }>;

  // Picture-in-Picture (LOCAL ONLY — never emits playback:* per canon §7)
  pip: {
    enter(opts: { videoElementId: string }): Promise<void>;
    exit(): Promise<void>;
    onChange(handler: (state: { active: boolean }) => void): () => void;
  };

  // Native OS notifications (fed by realtime notification:new)
  notifications: {
    show(n: DesktopNotification): Promise<void>;
    onActivated(handler: (payload: { deepLink: string; notificationId: string }) => void): () => void;
  };

  // Auto-update lifecycle (electron-updater, signed feed)
  updates: {
    onAvailable(handler: (info: { version: string }) => void): () => void;
    onDownloaded(handler: (info: { version: string }) => void): () => void;
    quitAndInstall(): void;
  };

  // OS integration
  deepLink: { onOpen(handler: (url: string) => void): () => void }; // cowatch:// protocol
  tray: { setBadgeCount(count: number): Promise<void> };
}

// Native notification payload — mirrors canon Notification types (§1)
export interface DesktopNotification {
  id: string;                          // ULID, ties to notification:new envelope
  type:
    | 'friend.online' | 'friend.room_started' | 'friend.invitation'
    | 'mention' | 'dm' | 'room.ownership_transfer' | 'room.user_joined';
  title: string;
  body: string;
  iconUrl?: string;                    // MinIO signed URL (avatar/thumbnail)
  deepLink: string;                    // cowatch://room/<roomId> | cowatch://dm/<threadId>
}
```

```ts
// apps/desktop/src/main — BrowserWindow security baseline (definition, canon §10)
const SECURE_WEB_PREFERENCES = {
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  webSecurity: true,
  preload: '/* path to typed contextBridge preload */',
} as const;
```

---

## Consequences → Pros

- **Complete capability coverage.** Every SPEC-mandated desktop feature (PiP, push, HW-accel, auto-update, IPC) is first-class on Electron with mature, documented APIs — no capability gaps to engineer around.
- **Maximum UI reuse.** The renderer is the **same `apps/web` bundle**; one React UI, one set of `packages/{ui,sdk,realtime,auth,social,types}`, one realtime envelope. Web and desktop stay in lockstep across all 13 development phases — exactly the ADR-001 "one atomic codebase" rationale.
- **Deterministic rendering.** Bundled, version-pinned Chromium means synchronized video, LiveKit WebRTC, and screen-share behave **identically** on every desktop install — critical for the <500 ms drift target (ADR-007) and predictable QA against the 90% coverage goal.
- **Turnkey auto-update.** `electron-updater` gives a signed, delta-capable background update channel out of the box — essential for a SaaS desktop fleet, far cheaper than building one.
- **Clean, typed native boundary.** The single `contextBridge` IPC surface (contracts in `packages/types`) keeps OS integration explicit, reviewable, and aligned with the canon's "types are the source of truth" rule.
- **Team & ecosystem fit.** Electron is TypeScript/Node-native (matches ADR-001/002), has the largest desktop ecosystem, and maps directly to the staffed Electron Engineer role and the canon's stated `apps/desktop` shape.

---

## Consequences → Cons

- **Heavy artifact.** ~80–150 MB installers and higher baseline RAM than native or Tauri — each install ships its own Chromium + Node runtime.
- **Broad attack surface.** A full browser + Node in the shell demands continuous hardening discipline (context isolation, sandbox, CSP, navigation/window allowlists); a misconfiguration is a serious RCE-class risk.
- **Signing & notarization overhead.** Auto-update requires Windows code signing and Apple notarization — certificates, secrets management (canon §10), and CI steps the DevOps Engineer must own.
- **Update treadmill.** Security parity means tracking Chromium/Electron releases and re-shipping promptly; falling behind ships known browser CVEs to the fleet.
- **Per-platform packaging complexity.** electron-builder targets (nsis/dmg/AppImage/deb), per-OS PiP/notification/tray quirks, and three-way QA add real cost versus a single web deploy.
- **Slower cold start** than native/Tauri, and a larger memory footprint that can matter on low-end machines.

---

## Risks & Mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|:--:|:--:|---|
| R1 | **Renderer security misconfiguration** (e.g. `nodeIntegration` on, weak CSP, open `window.open`) ⇒ RCE / token theft. | Med | High | Enforce the `SECURE_WEB_PREFERENCES` baseline (canon §10) in code review and CI lint; `contextIsolation` + `sandbox` + `nodeIntegration:false`; strict CSP; `setWindowOpenHandler` deny-by-default; navigation locked to allowlisted origins (API, YouTube, LiveKit, MinIO). Periodic Electron security audit (`electronegativity`). |
| R2 | **Outdated Chromium** ships known browser CVEs to the desktop fleet. | Med | High | Pin Electron in the monorepo; scheduled upgrade cadence gated by CI + test suite (90% coverage); `electron-updater` pushes patched builds quickly; track Electron security releases. |
| R3 | **Auto-update failure / bad release** bricks installs or stalls updates. | Low | High | Staged rollout + version channels; signed feed with checksum verification; `electron-updater` rollback-friendly (apply-on-restart, keep prior version); smoke-test the update path in CI before publish; health telemetry on update success rate. |
| R4 | **Code-signing / notarization breakage** blocks releases (expired certs, Apple policy changes). | Med | Med | DevOps owns certs as managed secrets (canon §10) with expiry alerts; notarization step is a gated CI stage with clear failure surfacing; document the signing runbook in `docker/`/`docs/`. |
| R5 | **PiP / notification / HW-accel divergence across OSes.** | Med | Med | Capability feature-detection via `getPlatformInfo`; per-OS QA matrix (win32/darwin/linux) in the test plan; detachable always-on-top `BrowserWindow` fallback where Document PiP is limited; document supported-OS baseline. |
| R6 | **Desktop UI fork drift** — desktop diverges from `apps/web`. | Low | High | Hard rule: renderer **is** `apps/web`; desktop-only behavior is feature-flagged in shared `packages/ui`, never a forked component tree; Turborepo build fails if desktop bundles a divergent UI. |
| R7 | **Refresh-cookie persistence in Electron** mishandled ⇒ broken sessions or leaked tokens. | Med | Med | Use a persistent session partition scoped per ADR-008; httpOnly cookie on `/api/v1/auth`; reuse-detection unchanged; never expose refresh material to the renderer/IPC; desktop is a first-class device `Session` revocable from `GET/DELETE /api/v1/auth/sessions`. |
| R8 | **Bundle size / memory** degrades low-end UX. | Med | Low | electron-builder delta updates; tree-shaken renderer (Vite); lazy-load heavy routes; single shared Chromium process model; document minimum specs. |

---

## Future Considerations

- **LiveKit data-channel transport.** Per ADR-004/ADR-005, a future `LiveKitDataChannelTransport` could carry realtime frames; the desktop shell already hosts the LiveKit client, so the transport swap stays config-driven (`REALTIME_TRANSPORT`) with no shell changes.
- **Native push vs. always-on realtime.** Today notifications ride the shared realtime `notification:new` event while the app runs. Evaluate true OS push (APNs/FCM/WNS) for a *closed* app if "wake on friend.room_started" becomes a requirement — would add a push-token registration flow to the auth/notifications modules.
- **Tauri re-evaluation.** If Electron's footprint/security cost outweighs benefits and the WebView rendering matrix matures enough to guarantee deterministic synced playback, revisit Tauri behind the same `apps/desktop` boundary — would be a superseding ADR (R3) since it changes the shell architecture.
- **Deep-link / protocol handler hardening.** As `cowatch://` deep links expand (join room, accept invite, open DM), formalize a validated deep-link schema in `packages/types` and guard against link-injection.
- **Mobile.** Electron does not cover mobile; if native mobile clients are added later, they reuse `packages/{sdk,realtime,types}` and the same API/realtime contracts — a separate ADR, not a change to this one.
- **Screen-share & global shortcuts.** Deepen OS integration (system-audio screen-share, global push-to-talk shortcut for voice channels) as the Voice phase (Phase 8) matures, all behind the typed IPC bridge.

---

*Conforms to [Architecture Canon](../context/architecture.md). Any change to this decision requires a superseding ADR + `history/` entry + context update + repomix update (R3/R4).*
