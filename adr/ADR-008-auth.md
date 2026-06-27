# ADR-008 — JWT access tokens + rotating refresh tokens (device sessions, OAuth, guests, 2FA)

> Authenticate with **short-lived RS256 JWT access tokens** plus **opaque rotating refresh tokens** in an httpOnly cookie, modeled as per-device **Sessions** with reuse-detection, OAuth (Google), guest accounts upgradable to registered, and TOTP **2FA** — owned in-house, not delegated to a third-party IdP.

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-06-27 |
| **Deciders** | Chief Architect (owner), Backend Engineer, Frontend Engineer, Electron Engineer, DevOps Engineer |
| **Related ADRs** | [ADR-002 — NestJS backend](./ADR-002-nestjs.md), [ADR-003 — Prisma over MongoDB](./ADR-003-prisma.md), [ADR-004 — Realtime abstraction](./ADR-004-realtime.md), [ADR-010 — Docker-first delivery](./ADR-010-docker.md) |
| **Canon** | [Architecture Canon §8 Auth / Token Model](../context/architecture.md#8-auth--token-model-adr-008), [§1 Glossary (User/Session)](../context/architecture.md#1-glossary-of-core-domain-terms), [§10 Cross-Cutting Non-Negotiables](../context/architecture.md#10-cross-cutting-non-negotiables) |
| **Supersedes** | — |
| **Last updated** | 2026-06-27 |

---

## Context / Problem

Cowatch is a Discord-like watch-party SaaS spanning **three clients** — a web app, an **Electron desktop app**, and a marketing landing site — all talking to one NestJS backend over **both REST and WebSockets** (ADR-002, ADR-004). Authentication is therefore not a single login form; it is a cross-cutting capability that must:

1. **Authorize both transports.** The same identity must guard REST controllers *and* WS gateways. WebSocket connections cannot send rotating cookies on every frame, so we need a **self-contained, statelessly-verifiable bearer credential** the gateway can validate on connect and on each authority-sensitive event (canon §6 permission model, §7 sync authority).
2. **Support the SPEC's full surface:** email/password, **Google OAuth**, **guest accounts** (ephemeral, upgradable), email verification, password reset, **device sessions** with independent revocation, **TOTP two-factor**, and session-family revocation. (SPEC AUTH; canon §1 *Session*, §8.)
3. **Be revocable and theft-resistant.** A long-lived credential that cannot be revoked is unacceptable for a social platform holding DMs, presence, and voice. We need short credential lifetimes *and* an explicit revocation story per device.
4. **Work across origins and a desktop shell.** The web app and API may sit on different subdomains; Electron runs from a custom/`file://`-style origin. The scheme must handle CORS + cookie scoping for the browser while still functioning inside Electron's `BrowserWindow` networking.
5. **Stay self-hostable and Docker-first** (ADR-010): no hard dependency on an external auth SaaS that would break the "everything runs in Docker, local→VPS→prod parity" mandate or leak user PII to a third party.

The decision is the **authentication architecture**: what credential(s) we issue, how they are stored and rotated, how sessions map to devices, and whether we own the identity layer or delegate it. This is foundational and expensive to reverse — it touches every protected endpoint, every WS gateway, the `AuthModule`, the `sessions` collection (canon §4), the `packages/auth` client helpers, and the `@cowatch/sdk` token-refresh logic. The canon already fixes the **target shape** in §8 (15-min RS256 access JWT, 30-day rotating opaque refresh in an httpOnly cookie, device sessions, reuse detection, TOTP); this ADR records *why* that shape was chosen over the two principal alternatives.

---

## Options Considered

### Option A — JWT access tokens + rotating refresh tokens, self-owned (*chosen*)

Short-lived **RS256 JWT access token** (15 min, `Authorization: Bearer`) carrying `sub`/`sid`/`kind`/`roles`; **opaque rotating refresh token** (30 day) stored **hashed** server-side as a per-`Session` token family, delivered as an **httpOnly + Secure + SameSite=Strict cookie** scoped to `/api/v1/auth`. Each refresh rotates the pair and invalidates the prior token; replay of a consumed token revokes the whole family (theft response). OAuth, guests, and TOTP layer on top of the same Session model.

- **Pros:** Stateless access-token verification works identically for REST and WS (the gateway just verifies the JWT signature — no DB round-trip per frame); 15-min lifetime caps the blast radius of a leaked access token; rotating opaque refresh + **reuse detection** gives real theft response and per-device revocation; cookie-bound refresh is invisible to JS (XSS can't exfiltrate it); fully self-hosted, no third-party PII egress, Docker-portable; maps cleanly onto canon §8 and the `sessions` collection (§4); RS256 lets us publish a JWKS so future services verify without sharing the signing key.
- **Cons:** We **build and own** the security-critical machinery — rotation, family revocation, reuse detection, hashing, key management, TOTP, OAuth callback handling — and must get it right; a valid (un-expired) access JWT cannot be revoked mid-life (we accept up to 15 min of residual access, mitigated by the short TTL + a session-revocation denylist check on sensitive ops); cookie + bearer dual-storage adds CSRF surface on the cookie-auth refresh route (mitigated, see Risks).

### Option B — Pure server-side session cookies (opaque session id, no JWT)

Classic stateful sessions: one opaque, httpOnly, Secure, SameSite session-id cookie; all session state in a server store (Mongo/Redis); every request looks the session up server-side.

- **Pros:** Conceptually simplest and very well-understood; **instant revocation** (delete the row → next request fails); no token-rotation or reuse-detection logic to author; nothing sensitive in the client beyond an opaque id; small attack surface for token forgery (there is no signed token to forge).
- **Cons:** **WebSocket auth is awkward** — cookies aren't naturally re-validated per WS frame, and a stateful lookup on every authority-sensitive realtime event (canon §7) is a hot-path DB hit we'd have to cache anyway, re-introducing the staleness JWT already solves; **every** request needs a session-store round-trip, coupling latency to the store and complicating horizontal scale; cross-origin/cross-subdomain and the **Electron desktop shell** make pure-cookie auth fragile (third-party-cookie and `SameSite` constraints, custom origins); no self-contained credential to publish to other services later; harder to express `roles`/`kind` claims without a per-request fetch.

### Option C — Third-party identity provider (Auth0 / Clerk / Firebase Auth / Cognito)

Delegate identity entirely: the IdP issues tokens, hosts login UI/flows, and manages OAuth, MFA, sessions, and user storage; our backend validates the IdP's JWTs via its JWKS.

- **Pros:** Fastest to a secure baseline — OAuth, MFA/TOTP, password reset, breach/anomaly detection, and compliance come **out of the box**, maintained by security specialists; offloads key management and most of the threat model; generous SDKs for web + a NestJS verifier.
- **Cons:** **Violates the self-hostable, Docker-first mandate** (ADR-010) — a hard external dependency that can't run fully offline/in-Docker for local→VPS parity; **user PII leaves our boundary** to a vendor (DMs/presence platform — privacy-sensitive); pricing scales with MAU and can become punishing for a social app; **guest accounts** and our exact **device-session + ownership-transfer** semantics (canon §6) are awkward or impossible to model in someone else's session abstraction; **vendor lock-in** and limited control over token shape/claims/lifetimes (our `sid`/`kind`/`roles` claims, 15-min TTL, RS256 choice); WS gateway still has to verify *their* tokens, so we don't even escape the integration work — we just lose control of the issuer.

> A delivers self-contained, dual-transport, self-hosted auth at the cost of owning the machinery. B is the simplest and most instantly-revocable but fights WebSockets, scale, and the desktop/cross-origin reality. C is the fastest secure start but contradicts the self-hosting/privacy/control mandates and still leaves WS integration on us. The decision weighs **dual-transport fit + self-hosting + control** (A) against **revocation simplicity** (B) against **speed-to-secure-baseline** (C).

---

## Decision

**Adopt self-owned JWT access tokens + rotating opaque refresh tokens with per-device Sessions (Option A)**, exactly as fixed by [canon §8](../context/architecture.md#8-auth--token-model-adr-008). Identity lives in-house in the NestJS **`AuthModule`** (canon §3); client helpers live in **`packages/auth`**; the typed flows are exposed through **`@cowatch/sdk`**; `Session` is persisted in the **`sessions`** collection (canon §4) via Prisma (ADR-003).

**Tokens (binding, canon §8):**

- **Access token** — JWT, **15-minute** lifetime, **RS256**-signed, sent as `Authorization: Bearer`. Claims: `sub` (userId), `sid` (sessionId), `kind` (`registered` | `guest`), `roles`, `iat`, `exp`. Verified **statelessly** by both REST guards and WS gateways; the public key is exposed via a JWKS endpoint so future services verify without holding the private key.
- **Refresh token** — **opaque** (ULID/CSPRNG, *not* a JWT), **rotating**, **30-day** lifetime, stored **hashed** (argon2/bcrypt) server-side as a per-`Session` **token family**. Delivered as an **httpOnly, Secure, SameSite=Strict** cookie **scoped to `/api/v1/auth`** so it is only ever sent to the refresh/auth routes.
- **Rotation & reuse detection** — every `POST /api/v1/auth/refresh` issues a **new** access+refresh pair and **invalidates the prior** refresh. Presenting an **already-consumed** refresh token is treated as theft: the **entire Session family is revoked** and a security notification is raised.

**Sessions (canon §1 *Session*, §8):** one `Session` per device (UA, IP-region, label, `lastSeenAt`), each owning one refresh-token family, independently revocable:

- `GET /api/v1/auth/sessions` — list this user's devices.
- `DELETE /api/v1/auth/sessions/:id` — revoke one device.
- `DELETE /api/v1/auth/sessions` — revoke **all others** (keep current).
- Logout revokes the **current** session. A Session is **not** a watch Room (canon §1).

**Flows (SPEC AUTH, canon §8):** email/password (argon2/bcrypt hashing, canon §10); **Google OAuth** at `POST /api/v1/auth/oauth/google`; **guest** issuance (short-lived session, `kind=guest`, `Guest` role defaults, **no** persistent refresh cookie beyond the browser session) with **upgrade-to-registered** that re-keys the same User; email verification; password reset via **single-use** tokens; **TOTP 2FA** enroll/verify/disable with one-time **recovery codes**. 2FA-enabled accounts complete a second factor *before* the token pair is issued.

**Claims contract** (canonical TS, owned by `packages/types`; definition only):

```ts
// packages/types — JWT access-token claims (canon §8)
export type UserKind = 'registered' | 'guest';

export interface AccessTokenClaims {
  sub: string;        // userId (Mongo ObjectId as string)
  sid: string;        // sessionId — ties the token to one device Session
  kind: UserKind;     // 'registered' | 'guest'
  roles: string[];    // coarse account roles; room-scoped RoomRole resolved separately (canon §6)
  iat: number;        // issued-at (epoch seconds)
  exp: number;        // expiry — issued at iat + 15m
}

// Persisted refresh-token family member (collection: sessions → tokens), definition only
export interface RefreshTokenRecord {
  sessionId: string;      // FK → sessions._id (ObjectId string)
  tokenHash: string;      // argon2/bcrypt hash of the opaque refresh token — RAW VALUE NEVER STORED
  family: string;         // ULID — the rotating-token lineage; reuse anywhere in the family ⇒ revoke all
  prevTokenHash?: string; // links the rotation chain for reuse detection
  consumedAt?: string;    // set on rotation; presenting a consumed token ⇒ theft response
  expiresAt: string;      // iat + 30d (UTC ISO-8601)
  createdAt: string;
}
```

The refresh cookie (definition only):

```
Set-Cookie: cw_refresh=<opaque-ulid>; HttpOnly; Secure; SameSite=Strict;
            Path=/api/v1/auth; Max-Age=2592000
```

**Transport authorization.** REST: a Nest `JwtAuthGuard` verifies the Bearer access token (RS256 via JWKS). WebSocket: the gateway verifies the same access JWT on `connect` and re-checks `sid`/`kind`/`roles` against a **session-revocation denylist** before accepting authority-sensitive events (canon §7 sync authority, §6 permissions). Because access tokens are short-lived, the denylist need only track sessions revoked within the last access-token TTL.

**Security baseline (canon §10):** TLS everywhere; argon2/bcrypt for passwords *and* refresh-token hashes; RS256 JWT; httpOnly + Secure + SameSite=Strict refresh cookie scoped to `/api/v1/auth`; **CSRF protection on the cookie-auth refresh mutation**; Helmet headers; **per-IP + per-user rate limiting** on all auth endpoints; strict CORS allowlist (web origin(s) + Electron); secrets (RS256 keypair, OAuth client secret, TOTP encryption key) only via env/secret store, **never committed**.

---

## Consequences → Pros

- **One credential authorizes both transports.** Stateless RS256 verification means REST guards and WS gateways validate identity *identically*, with no per-frame DB lookup — exactly what the authority-sensitive realtime model (canon §7) needs on its hot path.
- **Small blast radius on leak.** A stolen access token expires in 15 minutes; a stolen refresh token is httpOnly (XSS-proof), single-use, and triggers **whole-family revocation** the moment the legitimate client next rotates — genuine theft response, not just expiry.
- **First-class per-device control.** The `Session` model gives users a real "active devices" list with independent revocation and "log out everywhere," satisfying the SPEC and mapping straight onto the `sessions` collection (canon §4).
- **Self-hosted, Docker-first, private.** No external IdP dependency: identity runs entirely inside our NestJS service and Mongo, preserving local→VPS→prod parity (ADR-010) and keeping all user PII inside our boundary.
- **Full control of the token & flow shape.** We own claims (`sid`/`kind`/`roles`), lifetimes, the guest/upgrade lifecycle, and ownership-transfer-adjacent semantics (canon §6) — none of which fit cleanly into a third-party session abstraction.
- **Future-proof verification.** Publishing an RS256 JWKS lets additional services (or a future split-out auth service) verify access tokens without ever holding the private key.
- **Consistent with canon §8/§10 verbatim** — claims, lifetimes, cookie attributes, endpoints, and the reuse-detection rule are taken directly from the canon, so every downstream spec/task aligns by construction.

---

## Consequences → Cons

- **We own the hard parts.** Rotation, family revocation, reuse detection, password/refresh hashing, RS256 key management, OAuth callback handling, and TOTP are security-critical code *we* must implement, test (90% coverage target, canon §10), and maintain — the surface a third-party IdP would have handled.
- **Access tokens aren't instantly revocable.** A valid access JWT remains usable until `exp` (≤15 min). We accept bounded residual access and backstop sensitive operations with a session-revocation denylist — added complexity versus pure-session instant kill.
- **CSRF surface on the cookie route.** Because refresh rides a cookie, the `/api/v1/auth/refresh` mutation needs explicit CSRF protection (double-submit token / origin check) that a pure-bearer scheme would not (canon §10).
- **Dual-storage client logic.** Clients juggle a Bearer access token (memory) + a cookie refresh + silent-refresh-on-401 flow; `packages/auth` and `@cowatch/sdk` must implement this carefully and identically for web *and* Electron.
- **Cross-origin / Electron cookie nuances.** SameSite=Strict + subdomain/origin scoping and Electron's custom origin require deliberate CORS + cookie configuration and end-to-end testing per client.
- **Key-rotation operational burden.** RS256 keypair issuance, rotation, and JWKS publication become ops responsibilities (ADR-010) we wouldn't carry under an IdP.

---

## Risks & Mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|:--:|:--:|---|
| R1 | **Refresh-token theft / replay** (cookie exfiltration or interception). | Med | High | Opaque, **hashed-at-rest**, **single-use rotating** tokens; **reuse detection** revokes the entire Session family on any consumed-token replay; httpOnly+Secure+SameSite=Strict cookie scoped to `/api/v1/auth`; TLS everywhere (canon §10). Raise a security `notification.new` on family revocation. |
| R2 | **Access-token theft** within its 15-min window. | Med | Med | Short 15-min TTL caps exposure; WS gateway + sensitive REST ops consult a **session-revocation denylist** so a revoked `sid` is rejected before `exp`; never put secrets in the JWT (claims are non-sensitive identifiers only). |
| R3 | **XSS exfiltrates the access token** from web memory. | Med | High | Refresh cookie is httpOnly (unreachable to JS); strict CSP + Helmet (canon §10); access token held in memory (not `localStorage`); rigorous output encoding in the React app; short TTL limits any stolen access token. |
| R4 | **CSRF against the cookie-auth refresh route.** | Med | Med | SameSite=Strict cookie + **double-submit CSRF token / origin verification** on `POST /api/v1/auth/refresh` and all cookie-auth mutations (canon §10); cookie path-scoped to `/api/v1/auth`. |
| R5 | **We implement the auth machinery incorrectly** (rotation race, reuse-detection gap, weak hashing). | Med | High | Use vetted primitives (`argon2`/`bcrypt`, `@nestjs/jwt`, `otplib`/TOTP libs, Passport Google strategy) — **never hand-roll crypto**; 90% test coverage on `AuthModule` including reuse/theft and rotation-race scenarios; security review before Phase 1 ships (SPEC phases). |
| R6 | **RS256 signing-key compromise or loss.** | Low | High | Private key only via env/secret store, never committed (canon §10); plan JWKS-based key rotation with overlapping `kid`s; on compromise, rotate `kid` → all old access tokens fail verification, forcing re-auth. |
| R7 | **Guest-account abuse** (spam rooms/DMs, evasion). | Med | Med | `kind=guest`, `Guest` role defaults (canon §6), short-lived session, no persistent refresh; per-IP + per-user rate limiting (canon §10); guests gated by room config (`chatLock`, join approval) and excluded from privileged actions. |
| R8 | **TOTP enrollment/recovery weaknesses** (shared-secret leak, lost device lockout). | Med | Med | Encrypt TOTP secrets at rest; deliver one-time **recovery codes** at enrollment (hashed, single-use); require current 2FA (or recovery code) to disable; rate-limit verification attempts. |
| R9 | **Clock skew** breaks JWT `exp`/`iat` validation or TOTP windows. | Low | Med | NTP-synced containers (ADR-010); small `clockTolerance` on JWT verify; ±1 TOTP step tolerance; all timestamps UTC epoch (canon §10). |
| R10 | **OAuth callback CSRF / open redirect.** | Low | Med | Signed `state` parameter validated on callback; strict redirect allowlist; nonce/PKCE where supported; the Google strategy issues *our* Session + tokens, never trusting redirect-borne identity blindly. |

---

## Future Considerations

- **Additional OAuth providers.** The SPEC names Google first; the `AuthModule` is built provider-agnostic so adding GitHub/Discord/Apple is a new Passport strategy plus a route, not an architecture change — record each as a `history/` entry (R3); a new *architecture-level* identity decision would need a superseding ADR.
- **WebAuthn / passkeys.** Phishing-resistant passwordless login is a natural future second factor or primary credential; it layers onto the same Session model (issue our tokens after a successful assertion) without disturbing the token architecture.
- **Step-up authentication.** Sensitive actions (disable 2FA, transfer room ownership at scale, billing) could demand a fresh second factor / recent-auth claim; reserve a `amr`/`auth_time`-style claim in the access token for this.
- **Split-out auth service.** If load demands it, the JWKS-based RS256 design already lets us extract `AuthModule` into a standalone service that *issues* tokens while every other service merely *verifies* them — no shared secret, localized blast radius.
- **Refresh-token storage scale.** If the Session/refresh-family collection grows hot, move the rotation/denylist hot path to Redis (still Dockerized) behind the same `AuthModule` interface; record as an ADR if it changes the architecture (R3/R4).
- **Session anomaly detection.** Geo/UA-based "new device / impossible travel" alerts can reuse the existing `Session` metadata (UA, IP-region, `lastSeenAt`) to drive `notification.new` security alerts — an enhancement, not a re-architecture.
- **Account-deletion & data export.** GDPR-style erasure/export should be designed alongside the User/Session model; flag as a follow-up spec before Phase 12 (Deployment).

---

*Conforms to [Architecture Canon](../context/architecture.md). Any change to this decision requires a superseding ADR + `history/` entry + context update + repomix update (R3/R4).*
