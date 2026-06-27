# Business Context — Cowatch

> One-line purpose: Fast-load digest of **what Cowatch is, who it's for, and why it wins** — a pointer card to the full product docs, not a replacement for them.

**Status:** Context digest (Planning — Phase 0)
**Owner agent:** Documentation Engineer
**Last updated: 2026-06-27**

> This is a **condensed context file** for fast restore (R2). It summarizes and **points to** the authoritative product docs. On any conflict the source wins, in this order: [Architecture Canon](./architecture.md) → [PRD](../docs/PRD.md) → this digest.

---

## TL;DR

**Cowatch is a production SaaS, Discord-shaped social watch-party platform.** Friends gather in persistent rooms to watch synchronized media (YouTube first), chat, talk over voice/video/screen-share, and stay connected through a real social graph (friends, presence, DMs, notifications). Web app + Electron desktop + marketing landing site.

The thesis in one line: **watching together is the activity; the persistent social layer is the retention engine.** Cowatch is "a place you return to," not a one-off "paste a link, watch once" tool.

---

## Problem (why this exists)

| # | Broken today | Cowatch's answer |
|---|---|---|
| P1 | **Sync is fragile** — extensions/screen-share drift by seconds; reactions land out of time. | Server-authoritative playback, steady-state drift **< 500 ms** ([SYNC.md](../docs/SYNC.md)). |
| P2 | **No social fabric** — ephemeral, anonymous, no identity/friends/presence/DMs. | First-class persistent social graph ([SOCIAL.md](../docs/SOCIAL.md)). |
| P3 | **Communication is bolted on** — watch in one app, talk in another. | Unified text + voice + video + screen-share inside the room ([LIVEKIT.md](../docs/LIVEKIT.md)). |

## Product goals (success conditions)

- **G1** Rock-solid synchronized YouTube playback (<500 ms drift) — the core promise.
- **G2** Persistent social graph (accounts, friends, presence, DMs, notifications, blocking).
- **G3** Integrated communication (chat + reactions/GIFs/mentions/typing, voice, video, screen share).
- **G4** Flexible rooms (public/private/password, permanent/temporary, invite links, 4-tier roles, configurable sync authority).
- **G5** Cross-platform reach (responsive web + native Electron desktop: PiP, push, auto-update, HW accel).
- **G6** Production-grade trust (JWT + rotating refresh, 2FA, device sessions, observability, privacy).
- **G7** Discoverability (browse/search public rooms; global search across users, rooms, messages, videos, tags).
- **G8** Fully recoverable, process-disciplined build (R1–R5) — the team is AI-agent-driven.

## Explicit non-goals (v1)

Hosting/transcoding our own video; non-YouTube providers at launch; native mobile apps; monetization/billing; federation/public third-party API; ML/AI features; E2EE of chat/voice; live-streaming/broadcast/VOD recording; DRM/ad-insertion. See [PRD §2.2](../docs/PRD.md) for the full table and dispositions (the architecture leaves a provider seam at `QueueItem.provider`).

## Target personas (who)

| Persona | One-liner |
|---|---|
| **The Host** (Maya) | Runs a community; needs a controllable room with moderation + sync-authority config. |
| **The Regular** (Sam) | Watches nightly with 3–5 friends; lives in voice; needs frictionless re-entry + presence. |
| **The Drop-in** (Alex) | Clicked an invite link; wants zero-friction guest entry, later upgradeable to an account. |
| **The Explorer** (Priya) | Browses public rooms by interest/tags; needs discovery. |
| **The Desktop Power User** (Diego) | Keeps Cowatch open all day; needs PiP, OS push, auto-update, background run. |
| **The Moderator** (Jordan) | Trusted helper; needs targeted powers without owner-level settings access. |

Secondary requirement sources: **Trust & Safety** (moderation, blocking, NSFW, reporting) and the **founding/ops team** (observability, recoverability, deploy parity).

## Scope at a glance (maps to delivery phases)

Auth → Rooms → YouTube Sync → Chat → Friends → Notifications → Discovery → Voice → Video → Electron → Testing → Deployment. Phase order and gates: [project-state/current-phase.md](../project-state/current-phase.md).

---

## Source documents (read these for detail)

| Topic | Authoritative doc |
|---|---|
| Full product contract (vision, goals, personas, user stories, ACs) | [../docs/PRD.md](../docs/PRD.md) |
| System architecture | [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) |
| Domain model & glossary | [../docs/DOMAIN.md](../docs/DOMAIN.md) |
| Architecture canon (single source of truth) | [./architecture.md](./architecture.md) |

## Sibling context digests

[realtime.md](./realtime.md) · [permissions.md](./permissions.md) · [social.md](./social.md) · [deployment.md](./deployment.md) · [ui.md](./ui.md) · [RESTORE_CONTEXT.md](./RESTORE_CONTEXT.md)
