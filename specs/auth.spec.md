# Authentication Feature Specification

> R5 feature spec for Cowatch authentication: registration, login, token lifecycle, device sessions, email verification, password reset, TOTP 2FA, Google OAuth, and guest accounts. This is the Phase 1 contract that gates implementation.

**Status:** Draft — Planning (Phase 1: Authentication)
**Owner agent:** Chief Architect (spec) → Backend Engineer (implementation)
**Last updated: 2026-06-27**

> **Canon compliance.** This spec is downstream of and MUST comply with the [Architecture Canon](../context/architecture.md). On any conflict, the canon wins. It implements [Canon §8 — Auth / Token Model](../context/architecture.md#8-auth--token-model-adr-008) and [Canon §10 — Cross-Cutting Non-Negotiables](../context/architecture.md#10-cross-cutting-non-negotiables), and elaborates the design doc [docs/AUTH.md](../docs/AUTH.md). Type names, route shapes, event names, and error codes below match the canon and sibling docs **verbatim**.

**Primary references**

- Canon: [§8 Auth/Token](../context/architecture.md#8-auth--token-model-adr-008) · [§10 Non-Negotiables](../context/architecture.md#10-cross-cutting-non-negotiables) · [§3 Naming](../context/architecture.md#3-naming-conventions) · [§4 Data Modeling](../context/architecture.md#4-data-modeling-conventions-mongodb--prisma)
- ADR: ADR-008 — Auth tokens (defined in [Canon §2](../context/architecture.md#2-canonical-architecture-decisions-one-line--adr-id); RS256 JWT + rotating refresh)
- Design docs: [AUTH.md](../docs/AUTH.md) · [SECURITY.md](../docs/SECURITY.md) · [API.md §3.1 Auth](../docs/API.md#31-auth) · [EVENTS.md §5.1 system / §… handshake](../docs/EVENTS.md) · [DOMAIN.md §3.1 User / §3.2 Session](../docs/DOMAIN.md#31-user) · [DATABASE.md §4.1 users / §4.2 sessions](../docs/DATABASE.md#41-users)
- Sibling specs: [rooms.spec.md](./rooms.spec.md) · [sync.spec.md](./sync.spec.md) · [chat.spec.md](./chat.spec.md)

---

## 1. Overview & User Value

Authentication establishes **who the caller is** for every Cowatch surface (web, desktop, realtime gateway). It is the prerequisite for all social, room, sync, and chat features. Without it nothing else is trustable.

User value:

- **Frictionless entry** — a visitor can join a public watch party as a **guest** in one tap, then **upgrade** to a registered account without losing their room membership or chat history.
- **Trusted identity** — registered users sign in with email/password or **Google**, with **email verification**, **password reset**, and optional **TOTP two-factor**.
- **Account safety** — short-lived access tokens + **rotating refresh tokens with theft detection**, a per-device **session list** the user can revoke from, and immediate logout-everywhere on password change.
- **One identity across devices** — the same account works on the web app and the Electron desktop app; the realtime socket authenticates with the same access token.

This spec is the R5 contract; [docs/AUTH.md](../docs/AUTH.md) is the deep engineering design it is built on.

---

## 2. Scope

### 2.1 In scope

- Email/password **registration** and **login** (with anti-enumeration + constant-time comparison).
- **JWT access tokens** (RS256, 15 min) + **opaque rotating refresh tokens** (30 days) with **reuse detection** (theft response).
- **Google OAuth** (Authorization-Code + PKCE) including account linking by verified email.
- **Guest** account creation and **upgrade-to-registered** (preserving `User.id`).
- **Email verification** (single-use, 24 h) gating sensitive writes.
- **Password reset** (single-use, 1 h, global session revocation on success).
- **TOTP 2FA** enroll / challenge / disable + single-use recovery codes; **step-up** re-auth for security mutations.
- **Device sessions**: list, revoke-one, revoke-all-others, logout; **immediate** revocation via `sid` denylist + WS force-close.
- **Realtime WS handshake auth** using the same access JWT.
- Global roles in `roles` claim (e.g. `['user']`); **JWKS** endpoint for verifiers.

### 2.2 Out of scope (owned elsewhere)

- **Room-scoped authorization** (`RoomRole`, `SyncAuthority`, moderation) → [rooms.spec.md](./rooms.spec.md) + [docs/PERMISSIONS.md](../docs/PERMISSIONS.md). This spec only proves *identity* and `kind`.
- **Social graph / presence / DMs** → [docs/SOCIAL.md](../docs/SOCIAL.md).
- **Avatar/object storage mechanics** → `StorageModule` (MinIO); auth only *triggers* avatar provisioning on OAuth.
- **Profile read/update** (`GET/PATCH /api/v1/me`) → `UsersModule` (uses the same `JwtAuthGuard`).
- **WebAuthn/passkeys, magic links, SSO/SAML** → future phases (Open Questions).

---

## 3. Functional Requirements

IDs are stable; tests and tasks reference them.

| # | Requirement |
|---|---|
| **FR-1** | A visitor MAY register with `{email, password, displayName}`; the response is **non-enumerable** (identical for new vs. existing email). On success a `User(kind=registered, emailVerified=false)` and a `local` `AuthIdentity` are created and a verification email is sent. |
| **FR-2** | A registered user MAY log in with email/password. Comparison is **constant-time** (argon2id) with a dummy-hash path for unknown emails. Success issues a 15-min RS256 access JWT + a rotating refresh cookie and creates a `Session`. |
| **FR-3** | If the account has 2FA enabled, login returns `{ challenge: '2fa', challengeToken }` (scoped, 5 min, `aud=cowatch-mfa`) instead of tokens; the client completes via `POST /auth/2fa/challenge`. |
| **FR-4** | `POST /auth/refresh` **rotates**: it consumes the presented refresh, issues a new access+refresh pair, marks the prior `consumed`, and chains via `replacedById`. Requires the refresh cookie + CSRF. |
| **FR-5** | Presenting a **consumed or revoked** refresh token (outside a 10-s race grace window) is treated as **theft**: the entire `Session` family is revoked, the cookie cleared, a security alert is emitted, and the response is `401 REFRESH_REUSE_DETECTED`. |
| **FR-6** | A visitor MAY create a **guest** account with `{displayName}` and no credentials. Guests receive an access JWT (`kind=guest`) and **no durable refresh cookie** (browser-session lifetime only). |
| **FR-7** | A guest MAY **upgrade** to registered via `POST /auth/guest/upgrade` while authenticated as the guest, **preserving `User.id`**; the account gains a durable refresh family, a `local` `AuthIdentity`, `emailVerified=false`, and a verification email. |
| **FR-8** | Google **OAuth** uses Authorization-Code + **PKCE** with validated `state` (CSRF) and `nonce` (replay); the Google `id_token` signature/`iss`/`aud`/`exp` are verified. The access JWT **never** appears in a redirect URL. |
| **FR-9** | OAuth auto-links to an existing account **only** when that account's email is already verified; an unverified collision returns `409 ACCOUNT_LINK_CONFLICT` and prompts explicit linking. |
| **FR-10** | **Email verification** tokens are single-use, 24 h, hashed at rest. Until verified, a `@RequireVerifiedEmail()` guard blocks sensitive writes (room creation, DM send, invite generation) with `403 EMAIL_NOT_VERIFIED`; browsing/joining is allowed. |
| **FR-11** | **Password reset**: `POST /auth/password/forgot` is always `202` (non-enumerable). `POST /auth/password/reset` consumes a single-use, 1-h, hashed token, updates the hash, **revokes all sessions**, and emails a notice. |
| **FR-12** | **TOTP 2FA** enrollment (`/auth/2fa/enroll`) returns a base32 secret + `otpauth://` URI + QR; `/auth/2fa/enable` verifies a code and returns **10 single-use, hashed recovery codes shown once**. The secret is **encrypted at rest** (not just hashed). |
| **FR-13** | Enabling/disabling 2FA, deleting the account, and revoking sessions require **step-up** (recent re-auth); absence yields `401 STEP_UP_REQUIRED`. |
| **FR-14** | **Device sessions**: `GET /auth/sessions` lists active sessions (label, browser/OS, IP region, `lastSeenAt`, `current`); `DELETE /auth/sessions/:id` revokes one; `DELETE /auth/sessions` revokes all others; `POST /auth/logout` revokes the current session. |
| **FR-15** | Session revocation is **immediate**: the `sid` is added to a denylist (TTL = access-token lifetime, 15 min) checked by `JwtAuthGuard`, and any live WS bound to that `sid` is force-closed with `system:error` code `AUTH_SESSION_REVOKED`. |
| **FR-16** | The **realtime gateway** authenticates the same access JWT at `connect`; mid-stream access expiry is handled by a silent REST refresh + socket re-auth without dropping room subscriptions. |
| **FR-17** | A **JWKS** endpoint (`GET /auth/.well-known/jwks.json`) publishes the public RS256 keys (with `kid`) so the gateway and any future service verify statelessly. |
| **FR-18** | Every auth endpoint enforces **per-IP and per-account** rate limits (`auth-strict` bucket); every non-2xx response uses the canon error envelope with a ULID `correlationId`. No token or credential is ever logged. |

---

## 4. Data Model Touchpoints

> Source of truth for the data model is `packages/database/prisma/schema.prisma`; entity definitions live in [DOMAIN.md](../docs/DOMAIN.md) and the schema in [DATABASE.md](../docs/DATABASE.md). Auth collections and field-level Prisma fragments are detailed in [AUTH.md §15](../docs/AUTH.md#15-data-model-prisma-fragments). This section only enumerates touchpoints; it does **not** redefine the schema.

| Collection (`@@map`) | Role in auth | Key fields | Canon/ref |
|---|---|---|---|
| `users` | Account identity | `kind`, `email` (unique), `emailVerified`, `passwordHash?`, `twoFactorEnabled`, `roles[]` (global) | [DOMAIN §3.1](../docs/DOMAIN.md#31-user) · [DATABASE §4.1](../docs/DATABASE.md#41-users) |
| `auth_identities` | Provider links | `(provider, providerUserId)` unique; `local`/`google` | [AUTH §3](../docs/AUTH.md#3-identity-model--account-subtypes) |
| `sessions` | One device login | `userId`, `label`, `userAgent`, `ipRegion`, `lastSeenAt`, `revokedAt?` — index `(userId)` (canon-mandatory) | [DOMAIN §3.2](../docs/DOMAIN.md#32-session-device) · [DATABASE §4.2](../docs/DATABASE.md#42-sessions) |
| `refresh_tokens` | Rotating token family | `sessionId`, `tokenHash` (unique), `status`, `usedAt`, `replacedById`, `expiresAt` | [AUTH §9](../docs/AUTH.md#9-refresh-rotation--reuse-detection) |
| `email_tokens` | Verify / change-email | `userId`, `tokenHash`, `type`, `expiresAt`, `usedAt` | [AUTH §11](../docs/AUTH.md#11-email-verification) |
| `password_resets` | Reset flow | `userId`, `tokenHash`, `expiresAt`, `usedAt` | [AUTH §12](../docs/AUTH.md#12-password-reset) |
| `totp_secrets` | 2FA secret (encrypted) | `userId` (unique), `secretEnc`, `activatedAt?` | [AUTH §13](../docs/AUTH.md#13-totp-two-factor-enroll--challenge) |
| `recovery_codes` | 2FA recovery | `userId`, `codeHash`, `usedAt?` | [AUTH §13](../docs/AUTH.md#13-totp-two-factor-enroll--challenge) |

**Canon data-modeling compliance:**

- Every id is a Mongo `ObjectId` mapped to `_id`, exposed as a **string** across the service boundary (canon §4); correlation/message ids are **ULID** (canon §10).
- **Reference, not embed**, for `sessions`/`refresh_tokens`/`email_tokens`/etc. (independently queried, unbounded growth) — canon §4 hard rule.
- Every collection carries `createdAt`/`updatedAt`; soft-delete via `deletedAt?` where applicable (account deletion).
- `roles` on `users` is **global** only; per-room roles are never baked into the JWT (derived from `Membership` at access time — see [rooms.spec.md](./rooms.spec.md)).

> **New-collection note.** All auth collections above are within the canon set or are additive auth-specific collections (`auth_identities`, `refresh_tokens`, `email_tokens`, `password_resets`, `totp_secrets`, `recovery_codes`). Any collection not already named in [Canon §4](../context/architecture.md#4-data-modeling-conventions-mongodb--prisma) must be ratified via the R3/R4 process (ADR + history + context + repomix) before implementation — tracked in [DATABASE.md](../docs/DATABASE.md) and Open Questions.

---

## 5. API & Event Surface

### 5.1 REST (full catalog in [API.md §3.1](../docs/API.md#31-auth); detail in [AUTH.md §14](../docs/AUTH.md#14-rest-api-surface))

All under base `/api/v1/auth` (canon §3). Errors use the canon envelope (§7 below).

| Method & Path | Purpose | Auth |
|---|---|---|
| `POST /auth/register` | Email/password registration (+ verify email) | Public + Idempotency-Key |
| `POST /auth/login` | Login; may return 2FA challenge | Public |
| `POST /auth/2fa/challenge` | Complete TOTP step-up; issue tokens | Public (challenge token) |
| `POST /auth/refresh` | Rotate refresh, issue new access | Cookie+CSRF |
| `POST /auth/logout` | Revoke current session | Cookie+CSRF |
| `POST /auth/guest` | Create ephemeral guest session | Public (rate-limited) |
| `POST /auth/guest/upgrade` | Upgrade guest → registered | Bearer (guest) |
| `GET /auth/oauth/google` | Begin Google OAuth (PKCE) | Public |
| `GET /auth/oauth/google/callback` | OAuth callback; issue tokens | Public (state-validated) |
| `POST /auth/email/verify` | Confirm email token | Public (token) |
| `POST /auth/email/resend` | Resend verification email (`202`) | Bearer (rate-limited) |
| `POST /auth/password/forgot` | Begin reset (always `202`) | Public (rate-limited) |
| `POST /auth/password/reset` | Complete reset (single-use token) | Public (token) |
| `POST /auth/2fa/enroll` | Begin TOTP enrollment | Bearer (registered) + step-up |
| `POST /auth/2fa/enable` | Verify TOTP, return recovery codes | Bearer (registered) + step-up |
| `POST /auth/2fa/disable` | Disable TOTP | Bearer (registered) + step-up |
| `GET /auth/sessions` | List device sessions | Bearer |
| `DELETE /auth/sessions/:sessionId` | Revoke one session | Bearer + Self |
| `DELETE /auth/sessions` | Revoke all other sessions | Bearer |
| `GET /auth/.well-known/jwks.json` | Public RS256 keys for verifiers | Public |

> **Naming note.** `docs/API.md` uses `POST /auth/2fa/challenge` + `/auth/2fa/enroll` while `docs/AUTH.md §14` uses `/auth/2fa/verify` + `/auth/2fa/setup`. This spec adopts the **API.md route names** (`challenge`/`enroll`) as the wire contract and flags the inconsistency in Open Questions (OQ-A1) for the Backend Engineer to reconcile in one pass before implementation.

### 5.2 Realtime (WS handshake — [AUTH.md §18](../docs/AUTH.md#18-realtime-auth-ws-handshake), [EVENTS.md §5.1](../docs/EVENTS.md))

Auth has **no domain events**; it participates in the realtime plane only at the connection boundary:

| Event | Direction | Purpose |
|---|---|---|
| connect handshake (`RealtimeTransport.connect({ url, token })`) | C→S | Gateway verifies the access JWT (RS256, `kid`→JWKS, `exp`/`aud`/`iss`) and checks `sid` against the denylist; on success binds `userId=sub`, `sessionId=sid`. |
| `system:error { code: AUTH_TOKEN_INVALID }` | S→C | Invalid/expired token at connect → socket closed. |
| `system:error { code: AUTH_SESSION_REVOKED }` | S→C | Live session revoked → force-close that `sid`. |
| `system:error { code: AUTH_EXPIRED }` | S→C | Access token expired mid-connection → client silently refreshes, then re-auths (resume). |

All frames are the canonical `RealtimeEnvelope` (canon §5); auth never sends a domain payload.

---

## 6. Permissions

Authentication produces the **identity primitives** that every downstream permission check consumes; it does not itself enforce room permissions.

- **Access-token claims** (canon §8): `sub` (userId), `sid` (sessionId), `kind` (`registered`\|`guest`), `roles` (global), `amr` (auth methods), `iat`, `exp`, `iss=cowatch`, `aud=cowatch-api`.
- **`kind` gating**: endpoints marked `Bearer (registered)` reject `kind=guest` with `403 GUEST_FORBIDDEN`. Guests default to the `Guest` room role on join (canon §6) — see [rooms.spec.md](./rooms.spec.md).
- **`@RequireVerifiedEmail()`**: blocks sensitive writes until `emailVerified=true` (`403 EMAIL_NOT_VERIFIED`).
- **Step-up** (`recent-auth`): security-sensitive auth mutations require fresh re-authentication (`401 STEP_UP_REQUIRED`).
- **No room roles in the JWT**: `RoomRole`/`SyncAuthority` are derived server-side from `Membership` (canon §6) because they change far faster than a 15-min token.

> The room permission matrix and `RoomRole` enum are defined in [Canon §6](../context/architecture.md#6-permission-model) and [docs/PERMISSIONS.md](../docs/PERMISSIONS.md); this spec only guarantees the caller's identity and `kind`.

---

## 7. Standard Error Envelope & Codes

Every non-2xx response uses the canon REST envelope (canon §10); realtime failures use `system:error` with the **same `code` vocabulary** (canon §5):

```json
{ "error": { "code": "INVALID_CREDENTIALS", "message": "Human readable.",
  "details": {}, "correlationId": "01J...", "timestamp": "2026-06-27T..." } }
```

| Code | HTTP | When |
|---|---|---|
| `INVALID_CREDENTIALS` | 401 | Wrong email/password (generic, constant-time). |
| `EMAIL_NOT_VERIFIED` | 403 | Sensitive write before verification. |
| `EMAIL_TOKEN_INVALID` | 400 | Bad/expired/used verification token. |
| `RESET_TOKEN_INVALID` | 400 | Bad/expired/used reset token. |
| `REFRESH_INVALID` | 401 | Unknown/expired refresh token. |
| `REFRESH_REUSE_DETECTED` | 401 | Replayed consumed/revoked refresh → family revoked. |
| `MFA_REQUIRED` | 401 | Password ok, second factor needed (login challenge). |
| `TOTP_INVALID` | 400 | Wrong/expired TOTP or recovery code. |
| `STEP_UP_REQUIRED` | 401 | Sensitive auth action lacks recent re-auth. |
| `AUTH_SESSION_REVOKED` | 401 | Token's session was revoked (denylist / WS force-close). |
| `OAUTH_STATE_INVALID` | 400 | OAuth state/nonce mismatch (CSRF). |
| `ACCOUNT_LINK_CONFLICT` | 409 | OAuth email collides with unverified local account. |
| `GUEST_FORBIDDEN` | 403 | Action not allowed for `kind=guest`. |
| `CSRF_FAILED` | 403 | Missing/mismatched CSRF on a cookie route. |
| `RATE_LIMITED` | 429 | Per-IP / per-account throttle tripped. |

---

## 8. Implementation Tasks

> Detailed task breakdown lands in `tasks/auth.tasks.md` (Phase 1). High-level decomposition:

1. **Scaffold `AuthModule`** at `apps/server/src/modules/auth/` with `auth.module.ts`, `auth.controller.ts`, `auth.service.ts` and sub-services (`token.service.ts`, `session.service.ts`, `password.service.ts`, `oauth.service.ts`, `totp.service.ts`, `mail.service.ts`).
2. **Prisma models** — add `auth_identities`, `refresh_tokens`, `email_tokens`, `password_resets`, `totp_secrets`, `recovery_codes` and extend `users`/`sessions` in `packages/database/prisma/schema.prisma` (with `@@map`, indexes per canon §4).
3. **Shared types** — define `UserKind`, `AuthProvider`, `AccessTokenClaims`, `SessionSummary`, `LoginResult`, `MfaChallenge`, and DTOs (`RegisterDto`, `LoginDto`, `VerifyTotpDto`, `ResetPasswordDto`, …) in `packages/types`; never duplicate.
4. **RS256 keypair + JWKS** — key generation/loading from secret store, `kid` rotation, `GET /auth/.well-known/jwks.json`.
5. **TokenService** — access JWT mint/verify; opaque refresh mint; rotation + reuse detection (atomic conditional update; 10-s race grace).
6. **SessionService** — create/list/revoke device sessions; `sid` denylist (Redis, OQ-A2) with 15-min TTL; WS force-close hook into `RealtimeModule`.
7. **PasswordService** — argon2id hash/verify + server pepper; strength policy; constant-time + dummy-hash path.
8. **Email/password flows** — register (non-enumerable), login (+ MFA branch), email verify/resend, password forgot/reset (global revoke on reset).
9. **OAuthService** — Google Authorization-Code + PKCE, state/nonce, `id_token` verification, account linking, avatar provisioning via `StorageModule`, fragment-free token handoff.
10. **Guest flows** — guest creation (no durable refresh) + upgrade-to-registered preserving `User.id`.
11. **TotpService** — enroll (encrypted secret), enable (recovery codes), challenge, disable; step-up enforcement.
12. **Guards** — `JwtAuthGuard` (denylist check), `@RequireVerifiedEmail()`, step-up guard, CSRF double-submit middleware; `WsAuthGuard` for the gateway.
13. **Cross-cutting** — `auth-strict` rate limiting (per-IP + per-account), Helmet, strict CORS allowlist, structured pino logging with `correlationId` (no secrets), security-alert emails.
14. **Realtime handshake** — wire token verification + `AUTH_*` `system:error` codes into the gateway; mid-stream refresh/re-auth.
15. **Tests & docs** — unit/integration/e2e (§9), update [docs/AUTH.md](../docs/AUTH.md) cross-links, history + context + repomix + project-state per the per-feature workflow.

---

## 9. Test Plan

Coverage target **90%** (canon §10). Tokens/secrets are never logged or asserted in plaintext.

### 9.1 Unit
- `TokenService`: access JWT claim correctness (`sub/sid/kind/roles/amr/iat/exp/iss/aud`), RS256 sign/verify, `kid` selection, expiry; refresh mint entropy + hash-only persistence.
- Rotation/reuse state machine: Active→Consumed→ReuseDetected→FamilyRevoked; 10-s race grace returns the successor, not a false-positive theft.
- `PasswordService`: argon2id hash/verify, pepper, constant-time/dummy-hash path for unknown emails.
- `TotpService`: ±1 step skew tolerance, replay rejection within a step, recovery-code single-use, secret encryption round-trip.
- `SessionService`: denylist add/expire (TTL), `current` flag derivation, revoke-all-others excludes caller.
- Anti-enumeration: `register`/`forgot`/`resend` produce identical responses + comparable timing for existing vs. new email.

### 9.2 Integration (Nest test module + ephemeral Mongo)
- Full register → verify → login happy path; sensitive write blocked pre-verify (`EMAIL_NOT_VERIFIED`), allowed post-verify.
- `refresh` rotation: new pair issued, prior consumed, `replacedById` chained; reuse → `REFRESH_REUSE_DETECTED` + family revoked + cookie cleared.
- Login → 2FA challenge → `2fa/challenge` issues real tokens with `amr` including `otp`; recovery code path.
- Google OAuth callback with mocked Google: state/nonce validation, verified-email auto-link, unverified collision → `ACCOUNT_LINK_CONFLICT`; no token in any redirect URL.
- Guest create (no refresh cookie) → upgrade preserves `User.id` and gains a durable refresh family.
- Session list/revoke endpoints; immediate denylist effect on a subsequent Bearer call (`AUTH_SESSION_REVOKED`).
- Rate limiting: `auth-strict` bucket trips at the configured threshold (`429 RATE_LIMITED`).

### 9.3 End-to-end (web + gateway)
- Browser silent-refresh on load (in-memory access token rehydrated from the httpOnly cookie); no token in `localStorage`/`sessionStorage`.
- WS connect with a valid access token → `open`; session revoked from another device → live socket force-closed with `AUTH_SESSION_REVOKED` within the denylist window.
- Mid-stream access expiry → silent refresh + socket re-auth without dropping room subscription (coordinate with [sync.spec.md](./sync.spec.md) late-join/resume).
- Password reset from device A revokes device B's session globally; B is forced to re-login.

---

## 10. Documentation Requirements

- Keep [docs/AUTH.md](../docs/AUTH.md) authoritative for flows; this spec links to it rather than duplicating sequence diagrams.
- Reconcile route naming between [API.md §3.1](../docs/API.md#31-auth) and [AUTH.md §14](../docs/AUTH.md#14-rest-api-surface) (OQ-A1) and reflect the chosen names everywhere before code.
- Add an **auth integration guide** to `docs/` for the SDK (`packages/sdk`) and `packages/auth` describing the in-memory-access + httpOnly-refresh pattern and silent refresh.
- Per the per-feature workflow: update `history/decision-ledger.md`, `context/architecture.md` cross-links if any canon clarification lands, `repomix/`, and `project-state/` on completion.
- Document the `auth-strict` rate-limit bucket, the `sid` denylist backing store decision, and the recovery-code UX (shown once) in [docs/SECURITY.md](../docs/SECURITY.md).

---

## 11. Acceptance Criteria (testable, numbered)

- [ ] **AC-1** Email/password login returns a 15-min RS256 access JWT carrying exactly `sub, sid, kind, roles, amr, iat, exp, iss(=cowatch), aud(=cowatch-api)` plus an `HttpOnly; Secure; SameSite=Strict` refresh cookie scoped to `/api/v1/auth`. *(FR-2)*
- [ ] **AC-2** `POST /auth/refresh` issues a new access+refresh pair, marks the prior refresh `consumed`, and links it via `replacedById`. *(FR-4)*
- [ ] **AC-3** Replaying a consumed/revoked refresh token (outside the 10-s grace) returns `REFRESH_REUSE_DETECTED`, revokes the entire session family, clears the cookie, and emits a security alert. *(FR-5)*
- [ ] **AC-4** Google OAuth uses Authorization-Code + PKCE with validated `state`/`nonce`; a verified-email collision auto-links, an unverified collision returns `ACCOUNT_LINK_CONFLICT`, and the access token never appears in any redirect URL. *(FR-8, FR-9)*
- [ ] **AC-5** A guest is created without credentials and with no durable refresh cookie, and can upgrade to registered while preserving `User.id` and gaining a durable refresh family + verification email. *(FR-6, FR-7)*
- [ ] **AC-6** Email-verification tokens are single-use, 24-h, hashed at rest; sensitive writes return `EMAIL_NOT_VERIFIED` until verified. *(FR-10)*
- [ ] **AC-7** `password/forgot` is non-enumerable (always `202`); `password/reset` consumes a single-use 1-h hashed token, revokes all sessions, and emails a notice. *(FR-11)*
- [ ] **AC-8** TOTP enrollment returns an `otpauth://` URI + QR and 10 hashed single-use recovery codes (shown once); 2FA login requires a scoped challenge token then `2fa/challenge`; disable requires step-up; the secret is encrypted at rest. *(FR-12, FR-13)*
- [ ] **AC-9** `GET/DELETE /auth/sessions(/:id)` list/revoke device sessions; revocation is immediate via the `sid` denylist and a WS force-close with `AUTH_SESSION_REVOKED`. *(FR-14, FR-15)*
- [ ] **AC-10** The realtime gateway authenticates the same access JWT; revoked `sid`s are force-closed; mid-stream expiry triggers silent refresh + re-auth without dropping the room. *(FR-16)*
- [ ] **AC-11** `GET /auth/.well-known/jwks.json` serves the public RS256 keys with `kid`; the gateway verifies statelessly against them. *(FR-17)*
- [ ] **AC-12** Every auth endpoint enforces per-IP + per-account rate limits and returns non-2xx in the canon error envelope with a ULID `correlationId`; no access token is ever in `localStorage`/`sessionStorage`; no token/credential is logged; `AuthModule` reaches ≥ 90% coverage. *(FR-18)*

---

## 12. Open Questions

| # | Question | Recommendation |
|---|---|---|
| **OQ-A1** | Route-name mismatch: `2fa/challenge`+`2fa/enroll` (API.md) vs `2fa/verify`+`2fa/setup` (AUTH.md). | Adopt the **API.md names** (`challenge`/`enroll`) as the single wire contract; update AUTH.md §14 in the same PR. |
| **OQ-A2** | `sid` denylist backing store — Redis vs in-process map? | **Redis** (shared across replicas; canon is Docker/VPS-first and scales horizontally). In-process only for single-node dev. |
| **OQ-A3** | Guest session hard-expiry duration? | **24 h absolute** + browser-session bound; tune against abuse metrics. |
| **OQ-A4** | Retain raw IP for forensics before coarsening to region? | **30 days** raw (security window) then region-only; confirm in [SECURITY.md](../docs/SECURITY.md) with DevOps + privacy review. |
| **OQ-A5** | WebAuthn/passkeys as a stronger second factor? | Phase-2; design `auth_identities`/2FA tables to add a `factor` type without migration churn. |
| **OQ-A6** | Refresh-cookie `Path` — `/api/v1/auth` only? | Keep **`/api/v1/auth`** (tightest scope); SPA refreshes explicitly. |

---

### Related documents

- [Architecture Canon](../context/architecture.md) — single source of truth
- [docs/AUTH.md](../docs/AUTH.md) — auth engineering design
- [docs/SECURITY.md](../docs/SECURITY.md) — security baseline
- [docs/API.md §3.1](../docs/API.md#31-auth) — REST auth catalog
- [docs/EVENTS.md](../docs/EVENTS.md) — realtime envelope + handshake
- [docs/DOMAIN.md](../docs/DOMAIN.md) · [docs/DATABASE.md](../docs/DATABASE.md) — entities + schema
- Sibling specs: [rooms.spec.md](./rooms.spec.md) · [sync.spec.md](./sync.spec.md) · [chat.spec.md](./chat.spec.md)
</content>
</invoke>
