# ADR-009 — MinIO (S3-Compatible) for Object Storage, Not Cloud-Native S3 or DB Blobs

> Choose self-hosted, S3-API-compatible **MinIO** as the object store for all binary assets (avatars, room assets, uploads, thumbnails, transcode/derivative caches), explicitly rejecting hard-coding AWS S3, storing blobs in MongoDB, and serving from the local filesystem. **This ADR ratifies the already-canonical decision D-009 / [Canon §2 ADR-009](../context/architecture.md#2-canonical-architecture-decisions-one-line--adr-id); it formalizes an existing decision and changes nothing.**

**Status:** Accepted
**Date:** 2026-06-27
**Deciders:** Chief Architect, DevOps Engineer, Backend Engineer
**Related ADRs:** [ADR-002 — NestJS backend](./ADR-002-nestjs.md), [ADR-003 — Prisma over MongoDB](./ADR-003-prisma.md), [ADR-008 — Auth / Token Model](./ADR-008-auth.md), [ADR-010 — Docker-first delivery](./ADR-010-docker-first.md)
**Canon:** [Architecture Canon](../context/architecture.md) — see [§2 Canonical Decisions (ADR-009)](../context/architecture.md#2-canonical-architecture-decisions-one-line--adr-id), [§3 Naming Conventions](../context/architecture.md#3-naming-conventions), [§10 Cross-Cutting Non-Negotiables](../context/architecture.md#10-cross-cutting-non-negotiables)
**Last updated: 2026-06-27**

> Backfill note (B1, 2026-06-27): D-009 has been **Accepted** in the canon and the [decision ledger](../history/decision-ledger.md) since the Phase-0 foundation; the ADR file was never written. This document backfills it **verbatim to the canonical decision** — it ratifies, it does not re-decide. The pre-existing short-vs-long ADR filename skew on disk is tracked separately as **DOC-1** ([technical-debt.md](../history/technical-debt.md), Deferred-to-Phase-1).

---

## Context / Problem

Cowatch is a self-hostable, Discord-like watch-party SaaS that produces and serves a steady stream of **binary objects** that do not belong in the primary document database ([ADR-003](./ADR-003-prisma.md)):

- **User & room imagery** — avatars, room banners/cover art, emoji/sticker assets.
- **User uploads** — attachments referenced by chat `Message`s, GIFs, and other media.
- **Derived assets** — thumbnails, poster frames, and transcode/derivative **caches** generated server-side.

These objects share requirements that a relational/document store and a bare filesystem both serve poorly:

- **Out-of-band, large, immutable blobs** that must not bloat MongoDB documents or the working set ([ADR-003](./ADR-003-prisma.md)) — the database stores **references/keys + metadata**, never the bytes.
- **Direct, authorized client transfer** via **pre-signed URLs** so uploads/downloads bypass the Node app process (no proxying gigabytes through `apps/server`), with **least-privilege bucket policies** and signed-URL expiry ([Canon §10](../context/architecture.md#10-cross-cutting-non-negotiables)).
- **A `StorageModule`** ([Canon §3](../context/architecture.md#3-naming-conventions)) that owns bucket layout, key conventions, signed-URL minting, and lifecycle/retention — behind a single seam.
- **Deployment parity** across local / VPS / Vercel / production ([ADR-010](./ADR-010-docker-first.md)): the same storage contract in `docker compose` on a laptop and on a production VPS, with the **option** to point at a managed S3 in any environment without code change.
- **No hard cloud lock-in.** The platform's posture ([Canon §2/§10](../context/architecture.md#2-canonical-architecture-decisions-one-line--adr-id)) is self-hostable-first; storage must run on infrastructure we control while preserving an escape hatch to managed object storage.

The problem: **select the object-storage substrate and its access contract** so binary assets are stored out-of-band, transferred directly via signed URLs under least privilege, identical from dev to prod, and free of single-vendor lock-in — without coupling application code to any one provider's SDK semantics.

---

## Options Considered

### Option A — MinIO (self-hosted, S3-compatible) behind the AWS S3 SDK — **chosen**

Run **MinIO** as a container ([ADR-010](./ADR-010-docker-first.md)) exposing the **S3 API**. Application code talks to it through the **standard AWS S3 SDK** (`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`), configured by `S3_ENDPOINT` / credentials / bucket env. Because the wire contract is the S3 API, the same code runs against MinIO locally and against AWS S3 / Cloudflare R2 / any S3-compatible service in production by changing config only.

- **Pros:**
  - **Self-hostable and S3-portable at once** — own the bytes on a VPS today; swap to managed S3/R2 later via env, with **zero application-code change** (the SDK and the API are identical).
  - **Pre-signed URLs are first-class** — clients PUT/GET directly against storage; `apps/server` only mints time-boxed, scoped URLs, satisfying the "no proxying large blobs" and least-privilege goals ([Canon §10](../context/architecture.md#10-cross-cutting-non-negotiables)).
  - **Dev/prod parity** — one `minio` service in `docker compose` mirrors production semantics exactly ([ADR-010](./ADR-010-docker-first.md)); no "works locally, breaks on S3" drift.
  - **Bucket policies, lifecycle rules, and versioning** map onto our retention/least-privilege needs (e.g. short-lived caches vs. durable avatars).
  - **No SaaS lock-in or per-request egress surprise** for the self-hosted default; cost is owned infrastructure.
- **Cons:**
  - **We operate it** — capacity, durability (disk/replication), backups, and upgrades of the MinIO service are ours on the self-hosted path.
  - Single-node MinIO is a durability/availability concern until distributed/erasure-coded mode or a managed target is adopted (see Future Considerations).

### Option B — Hard-code a managed cloud object store (AWS S3 / Cloudflare R2) directly

Depend on a specific managed provider as the only storage backend, using its SDK and assumptions directly.

- **Pros:**
  - **Zero storage infrastructure to operate** — durability, scaling, and availability are the provider's problem; global edge/CDN integration is available.
  - Mature lifecycle, versioning, and event-notification features.
- **Cons:**
  - **Breaks the self-hostable-first posture** ([Canon §2](../context/architecture.md#2-canonical-architecture-decisions-one-line--adr-id)): a contributor or self-hoster cannot run the full stack offline / on a single VPS without a cloud account and live credentials.
  - **Vendor lock-in and metered egress** become structural; data residency is the provider's region.
  - **Not wasted, though:** because Option A speaks the **same S3 API**, this provider is reachable as a *config target* of Option A — making standalone Option B strictly dominated for this project.

### Option C — Store binaries in MongoDB (documents or GridFS)

Keep blobs inside the primary database as binary fields or via GridFS, so there is "one store."

- **Pros:**
  - One backup/restore story and one connection; transactional with metadata.
  - No second service to deploy for small/early workloads.
- **Cons:**
  - **Bloats the document working set** and backups, degrading the database that [ADR-003](./ADR-003-prisma.md) optimizes for hot relational/document access; large blobs poison cache locality.
  - **No native signed-URL direct transfer** — every byte is proxied through `apps/server`, contradicting [Canon §10](../context/architecture.md#10-cross-cutting-non-negotiables)'s direct-upload/least-privilege model and adding CPU/memory pressure to the API.
  - GridFS is an awkward, non-standard blob API with no S3 portability and no CDN-friendly URL story.

### Option D — Local filesystem / mounted volume on the app host

Write objects to a local disk path on `apps/server` and serve them via the app or a static file server.

- **Pros:**
  - Trivial to start; no extra service.
- **Cons:**
  - **Couples storage to a single host** — breaks horizontal scale-out (multiple `apps/server` instances cannot share local disk) and the multi-instance posture ([ADR-011](./ADR-011-realtime-backplane.md)).
  - **No S3 API, no signed URLs, no bucket policies** — re-implements an inferior object store by hand; no managed-target escape hatch.
  - Backups, lifecycle, and least-privilege become bespoke, error-prone scripts.

---

## Decision

**Adopt MinIO as the canonical object store for Cowatch**, accessed exclusively through the **S3 API via the AWS S3 SDK**, exactly as stated in [Canon §2 / ADR-009](../context/architecture.md#2-canonical-architecture-decisions-one-line--adr-id). This ADR **ratifies the existing decision D-009; it changes nothing.** Concretely:

1. **MinIO is the default, self-hosted backend**, run as a Docker service ([ADR-010](./ADR-010-docker-first.md)) alongside the rest of the stack in every environment. Storing binaries in MongoDB or on the local filesystem is **rejected**.
2. **The application speaks only the S3 API** through the AWS S3 SDK behind the **`StorageModule`** seam ([Canon §3](../context/architecture.md#3-naming-conventions)). No feature code imports MinIO-specific APIs; the endpoint/credentials/bucket are config (`S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, bucket names). **Switching to managed S3/R2 is a config change, not a code change.**
3. **The database stores references, never bytes.** Domain documents persist **object keys + metadata** (key, bucket, contentType, size, checksum); MongoDB never holds the blob payload ([ADR-003](./ADR-003-prisma.md)).
4. **Transfers use pre-signed URLs.** `apps/server` mints **time-boxed, scoped** signed URLs for client PUT (upload) and GET (download); large objects are **never proxied** through the Node process ([Canon §10](../context/architecture.md#10-cross-cutting-non-negotiables)).
5. **Least-privilege buckets.** Bucket policies follow least privilege ([Canon §10](../context/architecture.md#10-cross-cutting-non-negotiables)): private-by-default buckets, signed-URL-only access for user content, and separate buckets/prefixes per asset class (e.g. `avatars/`, `room-assets/`, `uploads/`, `thumbnails/`, `cache/`) with lifecycle/TTL rules for ephemeral caches.
6. **Auth integration.** Signed-URL minting is gated by the same permission model ([Canon §6](../context/architecture.md#6-permission-model)) and session/token checks ([ADR-008](./ADR-008-auth.md)) as the rest of the API; a user may only obtain a URL for objects they are authorized to read/write.

This decision is **canon-binding**: no application code may bypass the `StorageModule`/S3-API seam or persist blobs in MongoDB without a superseding ADR.

---

## Consequences → Pros

- **Self-hostable and portable simultaneously.** The S3-API contract means MinIO on a VPS today and managed S3/R2 tomorrow are the *same code* — preserving the self-hostable-first posture without foreclosing managed durability.
- **The app never carries blob bytes.** Pre-signed direct transfer keeps `apps/server` stateless and light, supports horizontal scale-out, and aligns with the least-privilege upload model ([Canon §10](../context/architecture.md#10-cross-cutting-non-negotiables)).
- **Database stays lean.** Keeping only keys/metadata in MongoDB protects the working set and backup size that [ADR-003](./ADR-003-prisma.md) depends on.
- **Dev/prod parity.** One `minio` Compose service reproduces production storage semantics exactly ([ADR-010](./ADR-010-docker-first.md)), eliminating provider-specific surprises.
- **Single seam, swappable backend.** `StorageModule` localizes all storage concerns; the backend is a config decision, mirroring the transport-abstraction philosophy of [ADR-004](./ADR-004-realtime.md).
- **Cost predictability** on the self-hosted default — owned storage, no per-request/egress metering surprises.

## Consequences → Cons

- **We operate the store on the self-hosted path** — durability (disk/replication/erasure coding), backups, monitoring, and upgrades of MinIO are ours.
- **Single-node MinIO is a SPOF** until distributed mode or a managed target is used; durability is bounded by the underlying disk and backup discipline.
- **Signed-URL lifecycle is our responsibility** — expiry windows, key namespacing, and orphan/garbage cleanup of unreferenced objects must be designed and enforced.
- **Two stores to back up** (MongoDB + MinIO) rather than one — backup tooling must cover both consistently.

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Single-node MinIO data loss (disk failure) | Medium | High | Off-host backups of the data dir on a schedule; adopt distributed/erasure-coded MinIO or a managed S3 target via config when durability needs grow (see Future Considerations); the second independent backup provider is selected at Phase 12 ([DEPLOYMENT](../docs/DEPLOYMENT.md)). |
| Signed-URL leakage / over-broad scope | Medium | High | Short expiry windows; per-object, per-method scoping; private-by-default buckets; mint only after permission + session checks ([Canon §6](../context/architecture.md#6-permission-model), [ADR-008](./ADR-008-auth.md)). |
| Orphaned objects (uploaded but never referenced) accumulate | Medium | Low | Lifecycle/TTL rules on `uploads/` and `cache/` prefixes; periodic reconciliation sweep matching keys against DB references. |
| Provider-specific behavior leaks into feature code | Low | Medium | All access through the `StorageModule`/S3-SDK seam; lint/dependency rule against importing MinIO-specific clients in feature modules. |
| Endpoint/credential misconfiguration across environments | Medium | Medium | Config-only switch (`S3_ENDPOINT`/keys/buckets) validated at boot; health/ready probe checks bucket reachability before serving. |
| Large-object abuse / unbounded uploads | Medium | Medium | Enforce content-length/contentType limits in the signed-URL policy and `StorageModule`; quota per user/room; reject unsigned/oversized PUTs. |

---

## Future Considerations

- **Distributed / erasure-coded MinIO** for production durability and availability once storage volume or SLA warrants it — a deployment change, not an application change.
- **Managed S3 / Cloudflare R2 as a config target** in any environment where managed durability or global edge delivery is preferred, reached through the identical S3-API seam ([ADR-010](./ADR-010-docker-first.md)).
- **CDN in front of public assets** (avatars, room art) for read scaling, served from signed or public-read URLs as policy dictates.
- **Lifecycle automation** for derivative caches and thumbnails (auto-expire), plus an orphan-object garbage collector reconciling MinIO keys against DB references.
- **Object versioning & immutability (WORM)** for assets requiring audit/retention; ties into the privacy/erasure work (GDPR anonymize-in-place, post-MVP) without bloating the hot path.
- **Per-bucket encryption-at-rest and SSE** as a hardening pass, coordinated with [SECURITY](../docs/SECURITY.md).

---

*Backfills and ratifies the pre-existing canonical decision (D-009). Supersedes: none. Amended by: none. See [Architecture Canon §2 (ADR-009)](../context/architecture.md#2-canonical-architecture-decisions-one-line--adr-id) for the canonical one-line statement and [decision-ledger.md](../history/decision-ledger.md) (D-009) for the ledger row.*
