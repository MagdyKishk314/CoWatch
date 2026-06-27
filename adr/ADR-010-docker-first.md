# ADR-010 — Docker-First Delivery for Every Service, Every Environment

> Standardize on **Docker** (and `docker compose`) as the unit of delivery and the source of dev/prod parity: every Cowatch service — `apps/server`, MongoDB, MinIO, Redis, LiveKit, and supporting workers — runs in a container across local / VPS / Vercel / production, explicitly rejecting host-native installs and per-environment bespoke setup. **This ADR ratifies the already-canonical decision D-010 / [Canon §2 ADR-010](../context/architecture.md#2-canonical-architecture-decisions-one-line--adr-id); it formalizes an existing decision and changes nothing.**

**Status:** Accepted
**Date:** 2026-06-27
**Deciders:** Chief Architect, DevOps Engineer, Backend Engineer
**Related ADRs:** [ADR-001 — Monorepo (Turborepo + pnpm)](./ADR-001-monorepo.md), [ADR-002 — NestJS backend](./ADR-002-nestjs.md), [ADR-004 — Custom Realtime Abstraction](./ADR-004-realtime.md), [ADR-009 — MinIO storage](./ADR-009-minio-storage.md), [ADR-011 — Realtime Backplane](./ADR-011-realtime-backplane.md)
**Canon:** [Architecture Canon](../context/architecture.md) — see [§2 Canonical Decisions (ADR-010)](../context/architecture.md#2-canonical-architecture-decisions-one-line--adr-id), [§10 Cross-Cutting Non-Negotiables](../context/architecture.md#10-cross-cutting-non-negotiables); deployment detail in [DEPLOYMENT.md](../docs/DEPLOYMENT.md)
**Last updated: 2026-06-27**

> Backfill note (B1, 2026-06-27): D-010 has been **Accepted** in the canon and the [decision ledger](../history/decision-ledger.md) since the Phase-0 foundation; the ADR file was never written. This document backfills it **verbatim to the canonical decision** — it ratifies, it does not re-decide. The pre-existing short-vs-long ADR filename skew on disk is tracked separately as **DOC-1** ([technical-debt.md](../history/technical-debt.md), Deferred-to-Phase-1).

---

## Context / Problem

Cowatch is a multi-service platform whose runtime is not one process but a **fleet of cooperating services**: the NestJS API + WS gateways (`apps/server`, [ADR-002](./ADR-002-nestjs.md)), **MongoDB** ([ADR-003](./ADR-003-prisma.md)), **MinIO** object storage ([ADR-009](./ADR-009-minio-storage.md)), **Redis** as the realtime backplane and per-room authority lock ([ADR-011](./ADR-011-realtime-backplane.md)), **LiveKit** for voice/video ([ADR-005](./ADR-005-livekit.md)), and background workers. These must come up together, talk to each other over a known network, and behave **identically** whether a single contributor runs them on a laptop or they run on a production VPS.

The constraints that shape delivery:

- **Multi-target, evolving deployment** ([Canon §10](../context/architecture.md#10-cross-cutting-non-negotiables)): self-hosted **VPS first**, with future targets including **Vercel/edge** and managed services — the realtime transport ([ADR-004](./ADR-004-realtime.md)) and storage ([ADR-009](./ADR-009-minio-storage.md)) are explicitly designed to be portable across these.
- **Many authors (AI agents + humans)** building incrementally across a 12-phase roadmap need a **one-command, reproducible** environment so "works on my machine" never blocks a phase.
- **Dev/prod parity is a correctness requirement**, not a convenience — the sub-500 ms sync loop ([ADR-007](./ADR-007-sync.md)), multi-instance fan-out ([ADR-011](./ADR-011-realtime-backplane.md)), and signed-URL storage ([ADR-009](./ADR-009-minio-storage.md)) all behave differently if the supporting services differ between environments.
- **Self-hostable-first posture** ([Canon §2](../context/architecture.md#2-canonical-architecture-decisions-one-line--adr-id)): a self-hoster must be able to stand up the whole stack on infrastructure they control, without a cloud account, and later opt into managed services by config.

The problem: **choose the delivery/packaging model** that gives one reproducible definition of the whole stack, identical from laptop to production, swappable between self-hosted and managed backends, and consumable by many automated and human contributors — without binding Cowatch to a single hosting vendor or a fragile, hand-maintained host setup.

---

## Options Considered

### Option A — Docker-first: every service containerized, `docker compose` for local, images for prod — **chosen**

Every service ships as a **container image**; local development uses **`docker compose`** to bring the full stack up with one command; production runs the **same images** on a VPS (Compose first; orchestration later if proven). Configuration is environment variables and mounted secrets, not baked-in. Images are built in CI ([ADR-001](./ADR-001-monorepo.md) Turborepo pipeline) and published to a registry (GHCR for launch).

- **Pros:**
  - **One definition of the whole stack** — `compose` declares `apps/server`, MongoDB, MinIO, Redis, LiveKit, and workers, their network, volumes, and env; `docker compose up` reproduces production topology locally.
  - **True dev/prod parity** — the *same image* runs in CI, on a laptop, and on the VPS; the sync loop, backplane fan-out, and signed-URL storage behave identically everywhere.
  - **One-command onboarding** for every author (AI agents + humans) — no host-native install matrix; a new contributor or a fresh CI runner is productive immediately.
  - **Self-hostable + managed-swappable** — services that can be managed in production (Mongo/MinIO/LiveKit) are **config-swappable** ([Canon §10](../context/architecture.md#10-cross-cutting-non-negotiables)) by pointing env at a managed endpoint instead of the local container, with no application-code change ([ADR-009](./ADR-009-minio-storage.md)).
  - **Clean path to edge/serverless** — containerization does not preclude Vercel/edge targets for the stateless surfaces; the realtime transport stays pluggable ([ADR-004](./ADR-004-realtime.md)/[ADR-011](./ADR-011-realtime-backplane.md)).
  - **Reproducible, pinned builds** — image digests + lockfiles ([ADR-001](./ADR-001-monorepo.md)) make rollouts deterministic and rollbacks trivial.
- **Cons:**
  - **Container/Compose literacy required** of contributors and agents; image build and layer caching add a build dimension to maintain.
  - **Local resource cost** — running the full stack (Mongo + MinIO + Redis + LiveKit) consumes meaningful RAM/CPU on a developer machine.
  - **We own the VPS orchestration story** until/unless a managed platform is adopted.

### Option B — Host-native installs (systemd services, language runtimes on the host)

Install Node, MongoDB, MinIO, Redis, and LiveKit directly on each host (dev and prod) and manage them with the OS init system.

- **Pros:**
  - Slightly lower runtime overhead (no container layer); familiar to traditional ops.
  - Direct host access for debugging.
- **Cons:**
  - **No parity** — versions, OS packages, and config drift between every laptop and the server; "works on my machine" becomes structural, breaking the parity correctness requirement.
  - **Brutal onboarding** — every contributor reproduces a fragile, undocumented install matrix; CI and local diverge.
  - **No clean rollback / immutable artifact** — upgrades mutate the host in place; reproducibility is lost.
  - Hostile to the many-authors model and the self-hostable-first goal.

### Option C — Kubernetes-first from day one

Define the platform as Kubernetes manifests/Helm charts and run K8s in every environment, including local (kind/minikube).

- **Pros:**
  - Best-in-class production orchestration: self-healing, autoscaling, rolling deploys, declarative infra.
  - Strong multi-instance scale-out story for the WS fleet ([ADR-011](./ADR-011-realtime-backplane.md)).
- **Cons:**
  - **Massive operational and cognitive overhead** for a pre-launch product with one VPS — premature complexity that slows every phase.
  - **Heavy local footprint** — running K8s locally for development is far more friction than `compose` for the same parity payoff.
  - **Not wasted, though:** Docker-first is the *prerequisite* for K8s — the same images promote to Kubernetes later (see Future Considerations), so Option C is a future evolution of Option A, not a competing foundation. K8s is **deferred to Phase 12, only when proven** ([DEPLOYMENT.md](../docs/DEPLOYMENT.md)).

### Option D — Fully managed PaaS per service (no containers we own)

Run each piece on a managed PaaS (e.g. managed Node hosting + Atlas + a SaaS object store + a realtime SaaS), with no self-owned container definitions.

- **Pros:**
  - Minimal infrastructure to operate; vendor handles scaling and durability.
- **Cons:**
  - **Breaks self-hostable-first** ([Canon §2](../context/architecture.md#2-canonical-architecture-decisions-one-line--adr-id)) — the whole stack cannot run on a single controlled host or offline.
  - **Vendor lock-in and cost** at watch-party scale, and no single reproducible local definition of the stack.
  - **Not lost, though:** managed Mongo/MinIO/LiveKit remain **config targets** of Option A, captured without surrendering the self-hosted default ([Canon §10](../context/architecture.md#10-cross-cutting-non-negotiables)).

---

## Decision

**Adopt Docker-first delivery for Cowatch**, exactly as stated in [Canon §2 / ADR-010](../context/architecture.md#2-canonical-architecture-decisions-one-line--adr-id). This ADR **ratifies the existing decision D-010; it changes nothing.** Concretely:

1. **Every service is containerized.** `apps/server`, MongoDB, MinIO ([ADR-009](./ADR-009-minio-storage.md)), Redis ([ADR-011](./ADR-011-realtime-backplane.md)), LiveKit ([ADR-005](./ADR-005-livekit.md)), and background workers all ship as container images. Host-native installs as the delivery model are **rejected**.
2. **`docker compose` is the canonical local environment.** One `docker compose up` brings the full stack online with the production topology, network, volumes, and env. New contributors (AI agents + humans) are productive with one command.
3. **The same images run in production.** Production runs the **identical** images built in CI ([ADR-001](./ADR-001-monorepo.md)) — **Compose-on-VPS first**; Kubernetes only when proven (Deferred-to-Phase-12). Configuration is env + mounted secrets; nothing environment-specific is baked into an image.
4. **Backends are config-swappable.** Self-hosted Mongo / MinIO / LiveKit are the default; pointing env at a **managed** endpoint swaps any of them in any environment with **no application-code change** ([Canon §10](../context/architecture.md#10-cross-cutting-non-negotiables), [ADR-009](./ADR-009-minio-storage.md)). The realtime transport stays pluggable for future edge/serverless targets ([ADR-004](./ADR-004-realtime.md)/[ADR-011](./ADR-011-realtime-backplane.md)).
5. **Images are reproducible and pinned.** Builds use lockfiles ([ADR-001](./ADR-001-monorepo.md)) and are published by digest to a registry (**GHCR for launch**); rollouts and rollbacks reference immutable digests.
6. **Health and lifecycle are container-native.** Each service exposes `/health/live` + `/health/ready` ([Canon §10](../context/architecture.md#10-cross-cutting-non-negotiables)); Compose/orchestrator gates traffic on readiness.

This decision is **canon-binding**: no service ships outside a container, and no environment-specific drift may bypass the image/config contract without a superseding ADR.

---

## Consequences → Pros

- **Parity by construction.** The same image in CI, locally, and in production removes the entire class of environment-drift bugs that would otherwise threaten the sync loop ([ADR-007](./ADR-007-sync.md)), backplane fan-out ([ADR-011](./ADR-011-realtime-backplane.md)), and signed-URL storage ([ADR-009](./ADR-009-minio-storage.md)).
- **One-command stack** for every author — onboarding, agent execution, and CnI all consume the same `compose` definition, supporting the many-authors model.
- **Self-hostable and managed-swappable.** Default self-hosted containers honor the self-hostable-first posture; managed endpoints are a config switch, preserving an escape hatch without lock-in.
- **Reproducible, reversible deploys.** Pinned image digests make rollouts deterministic and rollbacks a one-line pointer change.
- **Clean evolution path.** Containers promote to Kubernetes ([Phase 12](../docs/DEPLOYMENT.md)) and coexist with edge/serverless targets for stateless surfaces, with no foundational rewrite.
- **Operational uniformity.** Health probes, logging, and metrics are wired the same way in every container, satisfying [Canon §10](../context/architecture.md#10-cross-cutting-non-negotiables) consistently.

## Consequences → Cons

- **Container literacy is required** of contributors and agents; image builds and layer caching add a maintained build dimension.
- **Local resource cost** — running Mongo + MinIO + Redis + LiveKit together is heavier on a dev machine than a single process.
- **We own VPS orchestration** (Compose, then possibly K8s) until a managed platform is adopted — capacity, networking, and TLS are ours.
- **Image supply-chain hygiene** (base-image CVEs, registry access) becomes an ongoing responsibility.

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Local full-stack footprint too heavy for some machines | Medium | Low | Allow pointing env at shared/managed dev services for heavy components; document a "lite" Compose profile (e.g. external Mongo/LiveKit) for constrained machines. |
| Compose-on-VPS hits scaling/availability limits | Medium | Medium | Health probes + restart policies first; promote to **Kubernetes when proven** (Deferred-to-Phase-12, [DEPLOYMENT.md](../docs/DEPLOYMENT.md)); the same images promote unchanged. |
| Base-image CVEs / supply-chain risk | Medium | Medium | Pinned, minimal base images; CI image scanning; periodic rebuilds; least-privilege registry (GHCR) access. |
| Config/secret drift between environments | Medium | High | Single env-var contract validated at boot; secrets via mounted secret store, never baked into images ([Canon §10](../context/architecture.md#10-cross-cutting-non-negotiables)); ready-probe verifies dependencies. |
| Stateful services (Mongo/MinIO) data loss on container/volume mishaps | Medium | High | Named volumes with off-host backups; managed-target config-swap for production durability ([ADR-009](./ADR-009-minio-storage.md)); second independent backup provider chosen at Phase 12. |
| Image build time slows the many-authors loop | Medium | Low | Turborepo + Docker layer caching ([ADR-001](./ADR-001-monorepo.md)); multi-stage builds; cache mounts in CI. |

---

## Future Considerations

- **Kubernetes promotion** (Deferred-to-Phase-12, only when proven): the same images move from Compose to K8s/Helm for self-healing, autoscaling, and rolling deploys, with the WS fleet scaling behind the Redis backplane ([ADR-011](./ADR-011-realtime-backplane.md)).
- **Managed-backend config-swap** (Deferred-to-Phase-12): adopt managed Mongo (Atlas) / object storage / LiveKit per environment by env change only ([ADR-009](./ADR-009-minio-storage.md)).
- **Registry strategy beyond GHCR** if scale or policy warrants; image signing/provenance (e.g. cosign/SLSA) for supply-chain assurance.
- **Edge/serverless targets** for stateless surfaces (e.g. `apps/landing`, parallel low-dependency track) and the pluggable realtime adapters ([ADR-004](./ADR-004-realtime.md)) without abandoning the container baseline.
- **Off-host / second-provider backups** for stateful volumes, selected at Phase 12 ([DEPLOYMENT.md](../docs/DEPLOYMENT.md)).

---

*Backfills and ratifies the pre-existing canonical decision (D-010). Supersedes: none. Amended by: none. See [Architecture Canon §2 (ADR-010)](../context/architecture.md#2-canonical-architecture-decisions-one-line--adr-id) for the canonical one-line statement and [decision-ledger.md](../history/decision-ledger.md) (D-010) for the ledger row.*
