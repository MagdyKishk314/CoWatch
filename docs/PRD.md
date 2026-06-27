# Cowatch — Product Requirements Document (PRD)

> One-line purpose: Define **what** Cowatch is, **who** it is for, and **what** it must do — the product contract that every spec, task, and test traces back to.

**Status:** Draft — Phase 0 (Architecture) planning artifact
**Owner agent:** Chief Architect / Product
**Last updated: 2026-06-27**

**Canon & cross-links**

- Architecture canon (single source of truth): [../context/architecture.md](../context/architecture.md)
- Permission model: [../context/architecture.md#6-permission-model](../context/architecture.md#6-permission-model)
- Sync algorithm: [../context/architecture.md#7-sync-algorithm](../context/architecture.md#7-sync-algorithm)
- Auth / token model: [../context/architecture.md#8-auth--token-model-adr-008](../context/architecture.md#8-auth--token-model-adr-008)
- ADR index: [../adr/](../adr/) (created per architectural decision under R3/R4)

**Sibling planning artifacts** (canon-derived; this PRD is the product root they trace back to)

- System architecture: [./ARCHITECTURE.md](./ARCHITECTURE.md)
- Domain model: [./DOMAIN.md](./DOMAIN.md)
- Auth design: [./AUTH.md](./AUTH.md)
- Sync design: [./SYNC.md](./SYNC.md)
- Permissions design: [./PERMISSIONS.md](./PERMISSIONS.md)
- Voice/video (LiveKit): [./LIVEKIT.md](./LIVEKIT.md)
- Deployment: [./DEPLOYMENT.md](./DEPLOYMENT.md)

> This document is **product-level** (intent, scope, acceptance). It is subordinate to the architecture canon on any technical conflict. Where this PRD and the canon disagree on a technical fact, **the canon wins** and this PRD is corrected via the normal process (R3 history entry + context update).

---

## 1. Vision & Problem Statement

### 1.1 Vision

**Cowatch is a Discord-shaped social watch-party platform: a persistent home where friends gather in rooms to watch synchronized media together, talk over voice and video, and stay connected through a real social graph — presence, friends, DMs, and notifications.**

The product is not a one-off "paste a link, watch once" tool. It is a **place you return to**: durable rooms, durable friendships, durable identity. Watching media together is the activity; the social layer is the retention engine.

### 1.2 Problem Statement

Watching video together remotely today is broken across three dimensions:

1. **Sync is fragile.** Existing solutions (browser-extension sync, screen-sharing a video) drift, stutter, or require everyone to manually re-seek. Screen-sharing a video burns CPU/bandwidth, looks compressed, and has no shared controls. Drift of several seconds is normal and ruins shared reactions (the punchline lands at different times).
2. **The social fabric is absent.** Watch-together tools are ephemeral and anonymous — no persistent identity, no friends list, no presence ("who's around right now?"), no way to discover what friends are watching, no DMs. The "party" ends when the tab closes; there is nothing to come back to.
3. **Communication is bolted on or missing.** Users juggle a watch tool in one window and a separate voice app (Discord, a call) in another. Chat, reactions, voice, and screen share are not unified with the watch experience, so context is fragmented and presence is duplicated.

**Cowatch solves all three together**: server-authoritative sub-500 ms playback sync, a first-class persistent social graph, and integrated text/voice/video/screen-share — in one web + desktop product.

### 1.3 Why now / why us

- **Mature building blocks exist**: LiveKit (SFU WebRTC) for voice/video, MongoDB + Prisma for document data, NestJS for a modular realtime-capable backend, Electron for a native desktop shell. We assemble proven pieces rather than inventing transport-layer primitives.
- **A replaceable realtime abstraction** (see [ADR-004](../context/architecture.md#5-realtime-transport-abstraction-adr-004)) lets us ship a native-WebSocket VPS deployment now and migrate to serverless/edge transports later without rewriting product code — de-risking infrastructure bets.

---

## 2. Goals & Non-Goals

### 2.1 Goals (what success requires)

| # | Goal | Why it matters |
|---|------|----------------|
| G1 | **Rock-solid synchronized YouTube playback** with steady-state drift **< 500 ms** across all clients in a room. | The core promise. If sync is bad, nothing else matters. |
| G2 | **Persistent social graph**: accounts, friends, presence, DMs, notifications, profiles, blocking. | Retention engine; differentiates from ephemeral tools. |
| G3 | **Integrated communication**: text chat (reactions, GIFs, mentions, typing), voice channels, video, screen share inside the room. | Unifies "watch + talk" into one surface. |
| G4 | **Flexible rooms**: public / private / password, permanent & temporary, invite links, a four-tier role/permission model, configurable sync authority. | Supports both intimate hangs and larger communities. |
| G5 | **Cross-platform reach**: responsive web app + native Electron desktop (PiP, push, auto-update, HW accel). | Meets users where they are; desktop drives stickiness. |
| G6 | **Production-grade trust**: secure auth (JWT + rotating refresh, 2FA, device sessions), availability, observability, privacy controls. | It is a SaaS handling identity and social data. |
| G7 | **Discoverability**: browse/search public rooms by name, current video, viewer count, tags, NSFW flag, and friends-inside; global search across users, rooms, messages, videos, tags. | Turns isolated rooms into a network with organic growth. |
| G8 | **Fully recoverable, process-disciplined build** (R1–R5): planning precedes code; every change is traceable. | The team is AI-agent-driven; context can be lost and must be reconstructable. |

### 2.2 Non-Goals (explicitly out of scope for v1; some are later-phase)

| # | Non-Goal | Disposition |
|---|----------|-------------|
| NG1 | **Hosting / transcoding our own video library.** We embed third-party providers (YouTube first). We are not a CDN or a Netflix. | Permanent non-goal. |
| NG2 | **Non-YouTube providers at launch** (Vimeo, Twitch, direct MP4/HLS, Spotify, screen-as-source playlists). | Later phase; architecture leaves a provider seam (`QueueItem.provider`). |
| NG3 | **Mobile native apps (iOS/Android).** | Out of scope; responsive web is the mobile story for v1. Future consideration. |
| NG4 | **Monetization / billing / subscription tiers.** No paywalls, no Stripe, no premium gating in v1. | Later; product is built to support it but ships free. |
| NG5 | **Federation / self-host-as-a-product / public API for third parties.** | Out of scope. The internal SDK is for our own apps only. |
| NG6 | **AI features** (auto-moderation ML, recommendations engine, transcription/subtitles generation). | Out of scope for v1; basic rule-based moderation only. |
| NG7 | **End-to-end encryption of chat/voice.** Transport TLS + server-side authz only; no E2EE. | Out of scope; voice media is SFU-relayed (not E2EE by nature). |
| NG8 | **Live-streaming / broadcast (one-to-many RTMP ingest), DJ/audio-only rooms, watch-party recording/VOD.** | Out of scope for v1. |
| NG9 | **Server-side ad insertion, DRM-protected content playback.** | Permanent non-goal. |

---

## 3. Target Personas

| Persona | Profile | Core need | Primary jobs-to-be-done |
|---------|---------|-----------|-------------------------|
| **"The Host" — Maya, 24, community organizer** | Runs a friend group / small Discord-style community. Schedules movie nights and "react to this" sessions. | A reliable room she controls, with moderation tools and configurable who-can-control-playback. | Create a permanent room, set sync authority, promote moderators, kick/ban trolls, lock chat during a film, share an invite link. |
| **"The Regular" — Sam, 19, student** | Watches with the same 3–5 friends most evenings. Lives in voice chat. | Frictionless re-entry, presence ("who's online?"), one-click join, low-latency voice. | See friends online, join their room, talk over voice, queue the next video, react with GIFs. |
| **"The Drop-in" — Alex, guest, no account** | Clicked a friend's invite link. Doesn't want to sign up yet. | Zero-friction entry; watch and chat immediately as a guest. | Join via link as a guest, watch in sync, send chat, optionally upgrade to a registered account. |
| **"The Explorer" — Priya, 27** | Browses to find active public rooms to join based on interest/tags. | Discoverability: what's being watched right now, who's there, what's popular. | Browse/search public rooms, filter by tags, see friends inside, join a trending room. |
| **"The Desktop Power User" — Diego, 30** | Keeps Cowatch open all day on desktop. Multitasks. | Native feel: picture-in-picture, OS notifications, auto-update, runs in background. | Pop video out to PiP while working, get a desktop push when a friend starts a room, stay logged in across sessions. |
| **"The Moderator" — Jordan, 22** | Trusted helper in Maya's room. | Targeted powers without owner-level settings access. | Kick/ban/mute/timeout, manage the playlist, control playback (when authority allows), approve joiners. |

Secondary stakeholders (not end-users but requirement sources): **Trust & Safety** (moderation, blocking, NSFW, reporting), **the founding/ops team** (observability, recoverability, deploy parity).

---

## 4. User Stories (grouped by feature area)

> Format: `As a <persona>, I want <capability>, so that <outcome>.` Each group ends with high-level **Acceptance Criteria (AC)** stated as testable conditions. Detailed per-feature acceptance criteria live in the feature specs under [../specs/](../specs/); these are the product-level gates.

### 4.1 Authentication & Account (Phase 1)

- As a **new user**, I want to register with email/password or Google OAuth, so that I have a persistent identity.
- As a **registered user**, I want to verify my email and reset a forgotten password, so that my account is recoverable and trusted.
- As a **security-conscious user**, I want to enable TOTP 2FA with recovery codes, so that my account is protected even if my password leaks.
- As a **user on multiple devices**, I want to see my active device sessions and revoke any of them (or all others), so that I control where I'm logged in.
- As a **drop-in guest**, I want to join and participate without creating an account, and later upgrade that guest into a full account, so that I lose nothing if I commit.
- As **any user**, I want my access to refresh silently in the background, so that I'm not logged out mid-session.

**AC (Auth):**
- Access tokens are JWT with a **15-minute** lifetime; refresh tokens rotate, have a **30-day** lifetime, and are delivered as an httpOnly/Secure/SameSite=Strict cookie scoped to `/api/v1/auth`. (Per [§8 canon](../context/architecture.md#8-auth--token-model-adr-008).)
- Reusing a consumed refresh token revokes the **entire session family** (theft detection).
- Guest sessions carry the `Guest` role defaults and do not persist a refresh cookie beyond the browser session.
- 2FA enrollment yields a TOTP secret + single-use recovery codes; login requires the second factor when enabled.

### 4.2 Rooms, Membership & Permissions (Phase 2)

- As a **host**, I want to create a public, private, or password-protected room that is permanent or temporary, so that I can match the room to the occasion.
- As a **host**, I want to generate invite links (optionally expiring / single-use), so that I can let specific people in without making the room public.
- As a **host**, I want to assign moderators and transfer ownership, so that I can delegate control.
- As a **host/moderator**, I want to kick, ban, mute, and timeout members, lock chat, lock the playlist, and require join approval, so that I can keep the room healthy.
- As a **host**, I want to configure sync authority (owner only / owner + moderators / everyone), so that I decide who can control playback and the playlist.
- As a **member**, I want ownership to transfer automatically and fairly if the owner leaves, so that the room doesn't break when the owner disconnects.
- As **any member**, I want my role's permissions to be enforced consistently across REST and realtime, so that the rules are predictable.

**AC (Rooms):**
- Room visibility is exactly one of `public | private | password`; lifetime is `permanent | temporary`.
- The role set is exactly `Owner | Moderator | Member | Guest`, and the permission matrix matches [§6 canon](../context/architecture.md#6-permission-model) verbatim.
- **Ownership transfer** follows the canon algorithm: (1) prompt reachable owner within a 30 s grace window → (2) oldest-joined active Moderator → (3) oldest-joined active Member → (4) temporary room teardown / permanent room persists ownerless. Transfer is atomic, emits `room:ownership:transfer` and a `room.ownership_transfer` notification, and re-derives permissions for all members.
- A banned user cannot rejoin; a timed-out user regains rights at timeout expiry.

### 4.3 Media & Synchronized Playback (Phase 3)

- As a **member with authority**, I want to add YouTube single videos or playlists to the queue, reorder them (drag), remove them, and toggle autoplay, so that we have something to watch next.
- As a **member**, I want to vote on queue items and start skip-votes, so that the group decides democratically.
- As **any member**, I want play, pause, seek, rewind, fast-forward, and playback-speed changes to be synchronized for everyone, so that we react together.
- As **any member**, I want to keep my own volume, subtitle choice, audio track, and video quality local, so that personal preferences don't affect others.
- As a **late joiner**, I want to immediately snap to the room's current position, so that I'm instantly in sync.

**AC (Media Sync):**
- Steady-state cross-client drift is **< 500 ms** (primary KPI). The server is the authoritative clock and broadcasts `playback:sync` every **2 s** and immediately on state change. (Per [§7 canon](../context/architecture.md#7-sync-algorithm).)
- Drift correction follows the canon bands: `< 500 ms` no action; `500 ms – 2 s` rate-nudge ±5–10%; `≥ 2 s` hard seek.
- **Synced**: play, pause, seek, rewind, fast-forward, rate, current-item/autoplay advance, skip-vote outcome. **NOT synced**: volume, subtitle/caption, audio track, video quality, PiP.
- Only sync-authority-qualified members can emit mutating `playback:*`; others receive `system:error` with code `FORBIDDEN_SYNC`.
- A late joiner receives an immediate `playback:sync` snapshot on join.

### 4.4 Communication — Chat (Phase 4)

- As a **member**, I want to send text chat with emoji reactions, GIFs, and @mentions, and see typing indicators, so that conversation is rich and live.
- As a **member**, I want to edit and delete my own messages, so that I can fix mistakes.
- As a **host/moderator**, I want to lock chat (e.g. during a film) and mute/timeout offenders, so that I can manage the room.
- As **any user**, I want messages from people I've blocked to be hidden, so that blocking is meaningful.

**AC (Chat):**
- Chat uses canonical realtime events `chat:message:new|edit|delete`, `chat:typing`, `chat:reaction:add`.
- Messages are reference-collection records (never embedded in the room), carry denormalized `authorDisplayName/authorAvatarUrl`, and support reactions, mentions, and GIF/emoji attachments.
- When chat is locked, only Owner/Moderator can post; Guests' ability to send is gated by `chatLock` and room config.
- Blocked-user messages are suppressed for the blocker across chat and DMs.

### 4.5 Social — Friends, Presence, DMs, Notifications (Phases 5 & 6)

- As a **user**, I want to send/accept/decline friend requests and see my friends list, so that I have a stable social circle.
- As a **user**, I want to see friends' presence (`online | idle | dnd | offline`) and current activity (in-room), so that I know who's around and where.
- As a **user**, I want a direct-message thread with each friend, so that I can talk 1:1 outside rooms.
- As a **user**, I want notifications for: a friend coming online, a friend starting a room, a friend invitation, a mention, a DM, a room ownership transfer, and someone joining my room, so that I don't miss what matters.
- As a **user**, I want an activity feed of relevant social events, so that I can catch up.
- As a **user**, I want to block users, so that they disappear from my social surfaces.
- As a **user**, I want a profile page (avatar, display name, status), so that others can recognize me.

**AC (Social):**
- Friendship is mutual on acceptance; pending state is a directed `FriendRequest`. Blocking is directed and suppresses the blocked user across friends, presence, DMs, and chat.
- Presence values are exactly `online | idle | dnd | offline` with optional `{ kind: 'room'; roomId }` activity, delivered via `presence:update`.
- Notification types are exactly the canon set: `friend.online`, `friend.room_started`, `friend.invitation`, `mention`, `dm`, `room.ownership_transfer`, `room.user_joined`, delivered via `notification:new`.

### 4.6 Discovery & Search (Phase 7)

- As an **explorer**, I want to browse a list of public rooms showing name, current video, viewer count, tags, NSFW flag, and which friends are inside, so that I can pick a room to join.
- As a **user**, I want global search across users, friends, rooms, messages, videos, and tags, so that I can find anything quickly.
- As a **user**, I want to filter/hide NSFW rooms, so that the experience matches my preference.

**AC (Discovery):**
- The room list reads denormalized discovery fields (`Room.currentVideoTitle`, `Room.viewerCount`, `ownerDisplayName`, tags, NSFW flag) backed by the `rooms (visibility, isActive)` index.
- Only `public` rooms are discoverable; `private`/`password` rooms never appear in browse/search results for non-members.
- Search spans the six declared entity types and respects blocks and visibility rules.

### 4.7 Voice, Video & Screen Share (Phases 8 & 9)

- As a **member**, I want to join a voice channel inside the room (multiple channels, public or password-protected), so that we can talk while watching.
- As a **member**, I want to turn on my camera (video channel) and share my screen, so that we can hang out richly.
- As a **member**, I want my mic/camera state and speaking indicator visible to others, so that voice presence is clear.

**AC (Voice):**
- Voice/video/screen share is LiveKit-backed (per [ADR-005](../context/architecture.md#2-canonical-architecture-decisions-one-line--adr-id)); channels have visibility `public | password`.
- Realtime control-plane events use `voice:channel:join` / `voice:channel:leave`; media flows over LiveKit, not the app WebSocket.
- A room may have multiple voice channels; password channels require the channel password to join.

### 4.8 Desktop (Electron) (Phase 10)

- As a **desktop power user**, I want picture-in-picture so the video floats while I work, so that I can multitask.
- As a **desktop power user**, I want OS-level push notifications for friend/room/mention/DM events, so that I'm reachable when the app is backgrounded.
- As a **desktop user**, I want hardware-accelerated playback and seamless auto-update, so that the app is smooth and current.

**AC (Desktop):**
- The Electron app wraps the web app (per [ADR-006](../context/architecture.md#2-canonical-architecture-decisions-one-line--adr-id)) and adds PiP, native push, HW accel, auto-update, and IPC bridges.
- Notification payloads map 1:1 to the canon notification types.
- Auto-update is signed and delivered via electron-builder.

---

## 5. Functional Requirements (FR)

> Numbered, testable, traceable. Each maps to a development phase and feature spec. `MUST` = MVP-blocking unless marked `[Phase n]` as later.

### 5.1 Identity & Auth

- **FR-A1** The system MUST support registration via email/password and Google OAuth, and ephemeral guest accounts.
- **FR-A2** The system MUST issue RS256 JWT access tokens (15 min) and rotating opaque refresh tokens (30 day), with refresh delivered as an httpOnly/Secure/SameSite=Strict cookie scoped to `/api/v1/auth`.
- **FR-A3** The system MUST rotate refresh tokens on every `POST /api/v1/auth/refresh` and MUST revoke the entire session family on detected refresh-token reuse.
- **FR-A4** The system MUST support email verification, single-use password-reset tokens, and TOTP 2FA (enroll / verify / disable + recovery codes).
- **FR-A5** The system MUST track one `Session` per device (UA, IP-region, label, `lastSeenAt`) and expose list + revoke-one + revoke-all-others + logout.
- **FR-A6** The system MUST support upgrading a guest into a registered account without losing identity continuity where feasible.

### 5.2 Rooms & Permissions

- **FR-R1** Users MUST be able to create rooms with visibility `public | password | private` and lifetime `permanent | temporary`.
- **FR-R2** Rooms MUST support invite links, optionally expiring and/or single-use.
- **FR-R3** The system MUST enforce the `Owner | Moderator | Member | Guest` role model and the exact permission matrix from [§6 canon](../context/architecture.md#6-permission-model) across both REST and realtime.
- **FR-R4** Owners MUST be able to assign/revoke moderators and transfer ownership; only Owners may change room settings.
- **FR-R5** Hosts/moderators MUST be able to kick, ban, mute, timeout, lock chat, lock playlist, and require join approval.
- **FR-R6** The system MUST execute the canonical ownership-transfer algorithm on owner disconnect/leave, atomically, with the correct events and notification.
- **FR-R7** Rooms MUST expose a per-room sync-authority mode (`owner_only | owner_moderators | everyone`) governing playback control, and a separately configurable authority for playlist control.

### 5.3 Media & Sync

- **FR-M1** The system MUST support YouTube single videos and playlists as queue sources.
- **FR-M2** Members with authority MUST be able to add, reorder (drag), and remove queue items, and toggle autoplay.
- **FR-M3** The system MUST support queue-item voting and skip-voting, with the outcome synchronized.
- **FR-M4** The server MUST be the authoritative playback clock, broadcasting `playback:sync` every 2 s and on every state change, and MUST keep steady-state cross-client drift **< 500 ms**.
- **FR-M5** The system MUST synchronize play, pause, seek, rewind, fast-forward, rate, and item advance; and MUST keep volume, subtitles, audio track, quality, and PiP strictly local.
- **FR-M6** The server MUST reject mutating `playback:*` from non-authorized members with `system:error` code `FORBIDDEN_SYNC`, and MUST send a fresh `playback:sync` snapshot to late joiners.

### 5.4 Chat & Communication

- **FR-C1** The system MUST support room text chat with edit/delete (own messages), emoji reactions, GIF attachments, @mentions, and typing indicators, over the canonical `chat:*` events.
- **FR-C2** The system MUST support chat lock and per-user mute/timeout enforcement.
- **FR-C3** The system MUST hide blocked users' messages from the blocker.

### 5.5 Social Graph

- **FR-S1** The system MUST support friend requests (send/accept/decline/cancel), a friends list, and unfriend.
- **FR-S2** The system MUST broadcast presence (`online | idle | dnd | offline` + activity) via `presence:update`.
- **FR-S3** The system MUST support DM threads between users with the same message capabilities (subject to blocks).
- **FR-S4** The system MUST deliver the exact canon notification-type set via `notification:new`, with a notification feed (read/unread state) and an activity feed.
- **FR-S5** The system MUST support directed blocking that suppresses the blocked user across all social surfaces.
- **FR-S6** The system MUST provide user profiles (avatar, display name, status).

### 5.6 Discovery & Search

- **FR-D1** The system MUST provide a public-room browse list showing name, current video, viewer count, tags, NSFW flag, and friends-inside.
- **FR-D2** The system MUST provide global search across users, friends, rooms, messages, videos, and tags, respecting visibility and blocks.
- **FR-D3** The system MUST support an NSFW flag per room and a user-level NSFW filter preference.

### 5.7 Voice / Video / Screen Share

- **FR-V1** The system MUST support LiveKit-backed voice channels (multiple per room, public or password-protected).
- **FR-V2** The system MUST support camera video and screen sharing within a channel.
- **FR-V3** The system MUST surface mic/camera state and speaking indicators via the realtime control plane.

### 5.8 Desktop

- **FR-X1 [Phase 10]** The desktop app MUST wrap the web app and provide picture-in-picture, OS push notifications, hardware-accelerated playback, IPC bridges, and signed auto-update.

### 5.9 Cross-Cutting Platform

- **FR-P1** All REST APIs MUST be URI-versioned under `/api/v1`, use the canonical route shapes, and return the standard success/error envelopes.
- **FR-P2** All realtime frames MUST use the canonical `RealtimeEnvelope` and `namespace:entity:action` event names.
- **FR-P3** Every request and realtime operation MUST carry a ULID `correlationId` propagated across HTTP, WS, and logs.
- **FR-P4** All persistent state MUST be modeled in the Prisma schema at `packages/database/prisma/schema.prisma`, following the canon data-modeling conventions (embed vs reference, denormalization, indexing, soft-delete, timestamps).

---

## 6. Non-Functional Requirements (NFR)

### 6.1 Performance & Sync (the headline NFR)

| NFR | Requirement | Target | Measurement |
|-----|-------------|--------|-------------|
| **NFR-PERF-1** | Steady-state playback drift across clients in a room | **< 500 ms** (P95) | Client reports `|target − local|` after each `playback:sync`; aggregated server-side. |
| NFR-PERF-2 | Control-action latency (a play/pause/seek reflected on other clients) | < 300 ms P95 intra-region | Timestamp at emit vs. apply, via `corr`. |
| NFR-PERF-3 | `playback:sync` heartbeat cadence | every 2 s + on change | Server emit metric. |
| NFR-PERF-4 | Realtime event delivery latency (chat/presence) | < 250 ms P95 intra-region | Emit→deliver instrumentation. |
| NFR-PERF-5 | Initial room load (cold) to first synced frame | < 3 s P75 | Web vitals + custom timing. |
| NFR-PERF-6 | API read latency | < 200 ms P95 | Server histogram. |

### 6.2 Scalability

- **NFR-SCALE-1** A single room MUST support at least **50 concurrent synchronized viewers** (v1 target), with the architecture able to grow per-room ceilings without product changes.
- **NFR-SCALE-2** The platform MUST support **horizontal scale-out** of the NestJS gateway tier; the realtime transport abstraction ([§5 canon](../context/architecture.md#5-realtime-transport-abstraction-adr-004)) MUST not assume single-process affinity (room topics route across instances).
- **NFR-SCALE-3** Hot read paths (discovery list, room snapshot) MUST use the canon denormalization snapshots to avoid join fan-out.
- **NFR-SCALE-4** Voice/video scaling is delegated to LiveKit's SFU; the app tier MUST NOT relay media.

### 6.3 Availability & Reliability

- **NFR-AVAIL-1** Target service availability **99.5%** monthly for the API/realtime tier (v1).
- **NFR-AVAIL-2** Every service MUST expose `/health/live` and `/health/ready`.
- **NFR-AVAIL-3** Realtime clients MUST auto-reconnect with exponential backoff + jitter (base 500 ms, cap 15 s), auto re-subscribe topics, and resume via `lastEnvelopeId` or fall back to a fresh snapshot ([§5 canon](../context/architecture.md#5-realtime-transport-abstraction-adr-004)).
- **NFR-AVAIL-4** Ownership transfer and playback authority MUST degrade safely: a transient server hiccup MUST NOT leave a room permanently ownerless or desynced beyond the next heartbeat.
- **NFR-AVAIL-5** Data durability: MongoDB is the system of record; soft-deletes (`deletedAt`) preserve recoverability; MinIO stores blobs with least-privilege buckets.

### 6.4 Security & Privacy

- **NFR-SEC-1** TLS everywhere; passwords hashed with bcrypt/argon2; RS256 JWT; httpOnly+Secure+SameSite=Strict refresh cookie; CSRF protection on cookie-auth mutations; Helmet headers; strict CORS allowlist. (Per [§10 canon](../context/architecture.md#10-cross-cutting-non-negotiables).)
- **NFR-SEC-2** Per-IP and per-user rate limiting on auth and all write endpoints.
- **NFR-SEC-3** All input validated via `class-validator` DTOs; no unvalidated input reaches services.
- **NFR-SEC-4** Secrets only via env/secret store, never committed; MinIO uploads via signed URLs with least privilege.
- **NFR-SEC-5** Refresh-token theft response: reuse detection revokes the whole session family.
- **NFR-SEC-6 (Privacy)** Blocking, private/password room visibility, and NSFW filtering MUST be enforced server-side, never client-trust. Private/password rooms and their members MUST NOT leak via discovery or search.
- **NFR-SEC-7 (Abuse)** Rule-based moderation primitives (ban/mute/timeout/chat-lock) plus a user-report path MUST exist; ML auto-moderation is out of scope (NG6).

### 6.5 Accessibility

- **NFR-A11Y-1** UI MUST target **WCAG 2.1 AA**: keyboard navigability for all interactive controls, visible focus states, sufficient color contrast.
- **NFR-A11Y-2** Player and room controls MUST have ARIA roles/labels and be operable without a mouse; captions/subtitles (a local, user-controlled setting) MUST be selectable where the provider offers them.
- **NFR-A11Y-3** Realtime UI (chat, notifications) MUST use appropriate live regions so screen readers announce new content without stealing focus.
- **NFR-A11Y-4** Motion-heavy UI (Framer Motion) MUST honor `prefers-reduced-motion`.

### 6.6 Observability & Operability

- **NFR-OBS-1** Structured JSON logs (pino) with a `correlationId` (ULID) on every request/event, propagated via `x-correlation-id` header and envelope `corr`.
- **NFR-OBS-2** Prometheus-compatible metrics and health endpoints on every service; tracing spans across HTTP → service → WS.
- **NFR-OBS-3** Drift (NFR-PERF-1) MUST be a first-class emitted metric, dashboarded per room.

### 6.7 Compatibility & Portability

- **NFR-COMPAT-1** Web app MUST support the latest two major versions of Chrome, Edge, Firefox, and Safari, and be responsive down to tablet widths.
- **NFR-COMPAT-2** Everything MUST run in Docker with parity across local / VPS / Vercel / production (per [ADR-010](../context/architecture.md#2-canonical-architecture-decisions-one-line--adr-id)).
- **NFR-COMPAT-3** Desktop MUST target current Windows, macOS, and Linux via electron-builder.

### 6.8 Quality & Process

- **NFR-QUAL-1** Test coverage target **90%** across packages and apps.
- **NFR-QUAL-2** Process discipline R1–R5: planning artifacts precede code; every feature follows spec → tasks → tests → docs → (ADR) → implement → test → history → context → repomix → project-state.
- **NFR-QUAL-3** The project MUST be fully recoverable at any point (R2) from `project-state/`, `history/`, `context/`, and `repomix/`.

---

## 7. MVP Scope vs. Later Phases

Mapped to the canon development phases (0–12). **MVP = the smallest product that delivers the core promise (synced watching + the social spine that makes people return).**

### 7.1 MVP (Phases 0–7)

| Phase | Scope | In MVP? | Notes |
|-------|-------|:------:|-------|
| 0 — Architecture | Canon, ADRs, planning artifacts, scaffolding | ✅ | This phase. No app code yet (R1). |
| 1 — Authentication | Email/OAuth/guest, JWT+refresh, sessions, email verify, password reset, 2FA | ✅ | Trust foundation. |
| 2 — Rooms | Visibility/lifetime, invite links, roles, permissions, ownership transfer, sync-authority config | ✅ | Core container. |
| 3 — YouTube Sync | Authoritative clock, queue, voting/skip, drift control < 500 ms | ✅ | **The headline feature.** |
| 4 — Chat | Text, reactions, GIFs, mentions, typing, chat lock | ✅ | Table-stakes communication. |
| 5 — Friends | Friend requests, presence, DMs, blocking, profiles | ✅ | Retention spine. |
| 6 — Notifications | All canon notification types + feeds | ✅ | Closes the social loop. |
| 7 — Discovery | Public-room browse + global search + NSFW filter | ✅ | Network/growth. |

> **MVP definition of done:** A registered or guest user can create/join a public/private/password room, watch a YouTube queue in sync (< 500 ms drift) with role-based controls and automatic ownership transfer, chat with reactions/GIFs/mentions, maintain friends + presence + DMs, receive notifications, and discover/search public rooms — all on the responsive web app, secured per the auth model, running in Docker.

### 7.2 Later Phases (Post-MVP)

| Phase | Scope | Rationale for deferral |
|-------|-------|------------------------|
| 8 — Voice | LiveKit voice channels (public/password) | High value but independent of the watch-sync core; can ship as a fast follow. |
| 9 — Video | Camera video + screen share | Builds on Phase 8 voice plumbing. |
| 10 — Electron Desktop | PiP, push, HW accel, auto-update, IPC | Wraps the already-shipped web app; additive. |
| 11 — Testing | Coverage hardening to 90%, E2E, load/drift tests | Continuous, but a dedicated phase formalizes the gate. |
| 12 — Deployment | Production Docker/VPS/Vercel rollout, scaling, runbooks | Productionization of all the above. |

> Voice/Video/Desktop are **explicitly out of the MVP** but **in scope for v1.0**. The architecture (LiveKit seam, Electron-wraps-web) ensures they bolt on without rework.

---

## 8. Success Metrics / KPIs

### 8.1 North-Star

- **Weekly Co-Watch Minutes** — total minutes users spend in rooms with ≥ 2 participants and active playback. This single metric captures "people watching together," the product's reason to exist.

### 8.2 Product KPIs

| Category | KPI | Target (initial) |
|----------|-----|------------------|
| **Sync quality (core)** | P95 cross-client drift | **< 500 ms** |
| Sync quality | % of synced sessions with zero hard-seek corrections per 10 min | > 80% |
| Engagement | Median session length per active user | > 25 min |
| Engagement | Rooms with ≥ 2 concurrent participants (vs. solo) | > 60% of active rooms |
| Retention | D1 / D7 / D30 retention of registered users | track; D7 > 25% (early target) |
| Retention | Guest → registered conversion rate | > 15% of guests who return |
| Social | % of registered users with ≥ 1 friend within 7 days | > 50% |
| Social | DAU/MAU stickiness ratio | > 0.30 |
| Discovery | % of room joins originating from browse/search (vs. invite/friend) | track; growth signal |
| Communication | % of rooms with chat activity; % with voice (post-Phase 8) | track |
| Reliability | Realtime reconnect success rate | > 99% |
| Reliability | API/realtime availability | ≥ 99.5% |
| Trust | Reports per 1k active sessions; median time-to-moderation-action | track; downward |

### 8.3 Engineering KPIs

- Test coverage ≥ **90%** (NFR-QUAL-1).
- Drift metric dashboarded per room (NFR-OBS-3).
- Mean time to recovery (MTTR) for realtime incidents < 15 min.

---

## 9. Assumptions

- **AS-1** YouTube embedding (IFrame Player API) remains available and policy-compliant for synchronized playback; we control the player clock via its API, not the underlying stream.
- **AS-2** The architecture canon ([../context/architecture.md](../context/architecture.md)) is authoritative and stable for the MVP; deviations require ADR + history (R3).
- **AS-3** Initial deployment is a VPS with the native-WebSocket realtime transport (`NativeWsTransport`); serverless/edge transports are future, behind the same interface.
- **AS-4** LiveKit (self-hosted or managed) is available for Phases 8–9 and absorbs media-plane scaling.
- **AS-5** v1 ships **free** (no billing); cost is a fixed operational budget, not per-user revenue.
- **AS-6** The team is AI-agent-driven (Chief Architect, Backend, Frontend, etc.); recoverability (R2) and process discipline (R5) are first-class product requirements, not optional.
- **AS-7** Per-room concurrency target of 50 is sufficient for the initial audience (friend groups and small communities), not mass live-events.
- **AS-8** Users provide their own media via links; we host no copyrighted content (NG1), so DMCA exposure is bounded to embed-and-link, not hosting.
- **AS-9** Single primary deployment region at launch; cross-region latency optimization is a later concern (drift targets are stated intra-region).

---

## 10. Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|:---------:|:------:|------------|
| **RK-1** | **YouTube ToS / API changes or geo/embedding restrictions** break synced playback. | Med | High | Keep provider behind a `QueueItem.provider` seam; monitor ToS; design control plane (clock) independent of provider so a second provider can be added (NG2 later phase). |
| **RK-2** | **Drift target (< 500 ms) is hard under real network conditions / weak client clocks.** | Med | High | Server-authoritative clock + RTT-offset correction + rate-glide before hard-seek (canon §7); make drift a dashboarded metric; load/drift test in Phase 11. |
| **RK-3** | **Realtime scale-out across NestJS instances** (cross-instance room topics) is non-trivial. | Med | High | Transport abstraction (ADR-004) must not assume process affinity; plan a pub/sub fan-out layer; test multi-instance early. |
| **RK-4** | **Prisma-over-MongoDB maturity / feature gaps** (e.g. transactions, text search) surprise us. | Med | Med | Use MongoDB-native denormalization (canon §4) to avoid join reliance; reserve a separate search index; validate transaction needs (ownership transfer atomicity) in spike. |
| **RK-5** | **Ownership-transfer edge cases** (simultaneous disconnects, races) corrupt room state. | Med | High | Atomic server-side transfer; deterministic algorithm (canon §6); concurrency tests; idempotent transfer with event ordering. |
| **RK-6** | **Trust & Safety / NSFW / abuse** without ML moderation. | Med | High | Rule-based ban/mute/timeout + reporting + blocking + NSFW flag/filter; enforce server-side; clear ToS. |
| **RK-7** | **Voice/video cost & ops** (LiveKit SFU) larger than budgeted. | Med | Med | Voice deferred to Phase 8; capacity-plan with LiveKit; channels opt-in; media never relayed by app tier. |
| **RK-8** | **Guest abuse / spam** via zero-friction entry. | Med | Med | Guest role least-privilege; rate limits; room-level join approval, ban; ephemeral guest sessions. |
| **RK-9** | **AI-agent context loss** stalls or derails the build. | Med | Med | R2 recoverability: `project-state/`, `history/`, `context/`, `repomix/`; R5 per-feature workflow. |
| **RK-10** | **Scope creep** (mobile, more providers, monetization) delays the MVP. | High | Med | Explicit non-goals (§2.2); phased plan (§7); ADR gate for any architectural addition. |
| **RK-11** | **Clock-offset estimation error** on clients with bad system clocks. | Low | Med | Measure client↔server offset via ping/pong RTT on connect + periodically (canon §7); never trust client wall-clock for sync math. |

---

## 11. Open Questions

> Each item lists a **recommendation** to drive a decision. Resolving these may require an ADR (R3).

- **OQ-1 — Per-room concurrency ceiling beyond 50?**
  *Recommendation:* Target 50 for MVP (NFR-SCALE-1); revisit a 200+ "large room" mode after measuring realtime fan-out cost in Phase 11. Do not over-engineer now.
- **OQ-2 — Cross-instance realtime fan-out mechanism.**
  *Recommendation:* Introduce a Redis (or NATS) pub/sub backplane behind the `RealtimeTransport` server side for room-topic routing across NestJS instances. Needs an ADR before Phase 3 scale work; not required for single-instance MVP dev.
- **OQ-3 — Skip-vote & queue-vote thresholds and tie-breaking.**
  *Recommendation:* Default skip-vote passes at > 50% of active members; queue ordering by votes then insertion time; make thresholds room-configurable later. Decide in the Phase 3 spec.
- **OQ-4 — Guest upgrade identity continuity.**
  *Recommendation:* Preserve the guest's `userId` on upgrade (mutate `kind` `guest → registered`) so memberships/messages carry over; confirm Prisma/Mongo migration path in the Phase 1 spec.
- **OQ-5 — NSFW gating policy** (age confirmation vs. simple toggle).
  *Recommendation:* MVP ships a per-room NSFW flag + per-user filter (default hide). Defer age-verification/legal-gating to a Trust & Safety review; flag for legal.
- **OQ-6 — GIF provider** (Giphy vs. Tenor) and content moderation of GIFs.
  *Recommendation:* Tenor (Google) for embedding parity; use provider safe-search; finalize in the Phase 4 chat spec.
- **OQ-7 — Resume buffer depth** for realtime `lastEnvelopeId` replay.
  *Recommendation:* Server keeps a bounded per-room ring buffer (e.g., last N seconds/events); beyond it, force a fresh snapshot. Size it in the realtime spec after load testing.
- **OQ-8 — Data residency / single vs. multi-region** at launch.
  *Recommendation:* Single region for MVP (AS-9). Re-evaluate when drift across regions or user geography demands it; would require a multi-region ADR.
- **OQ-9 — Retention / deletion policy for messages, DMs, and uploads** (privacy/GDPR-style).
  *Recommendation:* Define a default retention + user-initiated account/data deletion flow before public launch; soft-delete now (canon §4), hard-delete policy TBD with legal.
- **OQ-10 — Moderation reporting & appeals workflow** depth for MVP.
  *Recommendation:* MVP = report → owner/mod queue + platform abuse inbox; structured appeals deferred. Confirm in a Trust & Safety mini-spec.

---

## 12. Traceability

This PRD is the product root. Downstream artifacts trace back to it:

- **ADRs** → [../adr/](../adr/) record the *how* for architectural choices referenced here (ADR-001…010 in canon §2).
- **Specs** → [../specs/](../specs/) refine each feature area (§4–§5) into detailed, testable specifications (R5).
- **Tasks** → [../tasks/](../tasks/) decompose specs into implementation work.
- **History** → [../history/](../history/) is the append-only decision log (R3).
- **Project-state** → [../project-state/](../project-state/) keeps the build recoverable (R2).

Any change to product scope here MUST follow process discipline (R3/R5): update history + context, and re-pack repomix.

---

*End of PRD. Subordinate to the [architecture canon](../context/architecture.md) on any technical conflict.*
