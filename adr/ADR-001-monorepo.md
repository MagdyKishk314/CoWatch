# ADR-001: Adopt a Turborepo + pnpm Monorepo

> One-line purpose: Establish a single, atomically-versioned codebase for all Cowatch apps and packages using Turborepo task orchestration over pnpm workspaces.

- **Status:** Accepted
- **Owner agent:** Chief Architect
- **Date:** 2026-06-27
- **Deciders:** Chief Architect, Backend Engineer, Frontend Engineer, DevOps Engineer
- **Related ADRs:** [ADR-002 (NestJS backend)](./ADR-002-nestjs-backend.md), [ADR-003 (Prisma over MongoDB)](./ADR-003-prisma-mongodb.md), [ADR-004 (Realtime abstraction)](./ADR-004-realtime-abstraction.md), [ADR-010 (Docker-first delivery)](./ADR-010-docker-first.md)
- **Canon:** [Architecture Canon](../context/architecture.md) — see [§2 Canonical Architecture Decisions](../context/architecture.md#2-canonical-architecture-decisions-one-line--adr-id) and [§9 Directory / Path Map](../context/architecture.md#9-directory--path-map--doc-cross-links)
- **Last updated: 2026-06-27**

---

## 1. Context / Problem

Cowatch is a production SaaS watch-party platform composed of **four applications** (`web`, `desktop`, `server`, `landing`) and **eight shared packages** (`ui`, `auth`, `database`, `realtime`, `social`, `sdk`, `shared`, `types`). These units are deeply interdependent:

- `packages/types` is the **single source of truth** for domain entities, DTOs, and realtime event payloads ([Canon §3](../context/architecture.md#3-naming-conventions)). Every other unit imports from it.
- `packages/realtime` exposes the `RealtimeTransport` interface and envelope ([Canon §5](../context/architecture.md#5-realtime-transport-abstraction-adr-004)) consumed identically by `apps/web`, `apps/desktop`, and `apps/server`.
- `packages/database` owns the Prisma schema and re-exports the generated client; the server and any tooling depend on its generated types.
- `apps/desktop` (Electron) **wraps** the `apps/web` build ([ADR-006](./ADR-006-electron-desktop.md)), so the two must stay version-locked.
- `packages/sdk` is the typed API client that `web`, `desktop`, and `landing` all consume, and it must move in lockstep with the server's REST/realtime contracts.

This produces a tight, **single dependency graph** where a change to a shared contract (e.g. adding a field to `PlaybackSyncEvent`) must propagate atomically to producers and consumers. The team also operates under strict **process discipline** ([Canon §10](../context/architecture.md#10-cross-cutting-non-negotiables), R2–R5): planning artifacts precede code, every feature flows through spec → tasks → tests → docs → implement, and the project must be **fully recoverable** at any point. A fragmented repository topology would scatter that history and make atomic, reviewable changes impossible.

**The problem:** choose a repository topology and tooling that (a) lets a single PR atomically change a shared contract and all its consumers, (b) gives fast, cached, incremental builds/tests across 12 units, (c) keeps a single lockfile and dependency graph for reproducibility, and (d) integrates cleanly with the Docker-first delivery model ([ADR-010](./ADR-010-docker-first.md)) and a 90% coverage gate.

---

## 2. Options Considered

We evaluated three viable topologies. (A fourth — a single flat package with no workspace boundaries — was rejected outright as it provides no module isolation, no per-unit dependency declarations, and no enforceable boundaries; it is not carried forward.)

### Option A — Polyrepo (one Git repository per app/package)

Each app and package lives in its own repository; shared packages are published to a private registry (e.g. Verdaccio / GitHub Packages) and consumed by semver.

- **Pros:**
  - Hard isolation; independent CI pipelines and access control per repo.
  - Smaller individual clones; familiar to teams scaling org-wide.
- **Cons:**
  - **Atomic cross-cutting changes are impossible** — a `packages/types` change requires publish → bump → PR in every consumer, across N repos, with version-skew windows. Fatal for our single-dependency-graph contracts.
  - Heavy publish/release overhead for 8 internal packages that are never consumed externally.
  - Fragments history and recoverability (R2) across many repos; no single source of truth for project state.
  - Local DX is poor: linking 12 units for development needs `npm link`/registry gymnastics.

### Option B — Monorepo on npm/yarn workspaces (no dedicated build orchestrator)

A single repo using `npm` or `yarn` (Classic or Berry) workspaces, with builds driven by hand-written root scripts (`npm run build --workspaces`) or `yarn workspaces foreach`.

- **Pros:**
  - Single repo, single lockfile, atomic cross-package changes.
  - No additional orchestration tool to learn; ships with the package manager.
- **Cons:**
  - **No task graph or caching** — every `build`/`test`/`lint` re-runs across all 12 units regardless of what changed; CI time grows linearly and wastefully.
  - npm/yarn-classic use a **hoisted, flat `node_modules`**, allowing **phantom dependencies** (importing a transitive dep never declared in `package.json`) — silently breaks our strict per-unit boundaries.
  - Ordering of interdependent builds (`types` → `database` → `sdk` → apps) must be hand-maintained; brittle as the graph grows.
  - No first-class remote caching for CI without bolting on extra tooling.

### Option C — Monorepo on Turborepo + pnpm workspaces (CHOSEN)

A single repo where **pnpm** manages workspaces and the dependency graph (content-addressed store, symlinked `node_modules`, strict non-flat resolution), and **Turborepo** orchestrates tasks (`build`, `lint`, `test`, `typecheck`) with a topological task graph plus local and remote caching.

- **Pros:**
  - **pnpm's strict, symlinked store eliminates phantom dependencies** — a unit can only import what it explicitly declares, enforcing Canon's package boundaries by construction.
  - **Turborepo's content-aware caching + topological task graph** means only changed units (and their dependents) rebuild/re-test; cache hits replay outputs instantly. Critical for the 90% coverage gate running on every PR.
  - One lockfile (`pnpm-lock.yaml`), one dependency graph → reproducible installs from dev → VPS → Vercel → production ([ADR-010](./ADR-010-docker-first.md)).
  - pnpm's content-addressed store + Docker's layered builds and `--filter` deploys produce small, deterministic per-app images.
  - Atomic cross-cutting PRs: change `packages/types` and every consumer in one reviewable commit.
- **Cons:**
  - Two tools to configure/learn (pnpm + Turborepo) vs. one.
  - pnpm's symlinked layout occasionally trips tools assuming a flat `node_modules` (some bundlers, Electron packagers) — needs targeted config.
  - Remote cache requires either Vercel's hosted cache or a self-hosted cache server (operational surface).

---

## 3. Decision

**Adopt Option C: a single monorepo using Turborepo for task orchestration over pnpm workspaces**, exactly as mandated by [Canon §2 / ADR-001](../context/architecture.md#2-canonical-architecture-decisions-one-line--adr-id).

Concretely:

- **One Git repository** rooted at `cowatch/`, structured per [Canon §9](../context/architecture.md#9-directory--path-map--doc-cross-links): `apps/{web,desktop,server,landing}` and `packages/{ui,auth,database,realtime,social,sdk,shared,types}`, alongside the non-code directories (`adr/`, `context/`, `docs/`, `specs/`, `tasks/`, `history/`, `project-state/`, `repomix/`, `instructions/`, `prompts/`, `scripts/`, `docker/`).
- **pnpm workspaces** declared via `pnpm-workspace.yaml` (`apps/*`, `packages/*`); a single `pnpm-lock.yaml` at the root is the only lockfile. Internal dependencies are referenced with the `workspace:*` protocol so they never resolve to a registry version.
- **Turborepo** (`turbo.json` at root) defines the pipeline with topological `dependsOn: ["^build"]` ordering, declared `inputs`/`outputs` for caching, and tasks `build`, `dev`, `lint`, `typecheck`, `test`, `test:cov`. The `^` operator guarantees the build order `types → {database, shared} → {sdk, realtime, auth, social, ui} → apps`.
- **`packages/types` remains the single source of truth** for domain + DTO + event types; no type duplication across units ([Canon §3](../context/architecture.md#3-naming-conventions)).
- **Caching:** local Turbo cache enabled everywhere; **remote cache** enabled in CI and Docker build stages (hosted via Vercel Remote Cache or a self-hosted equivalent) keyed by content hash.
- **Node + package manager versions are pinned** (`engines` + `packageManager` field in root `package.json`, enforced via Corepack) so dev, CI, and Docker resolve identically.
- **Docker integration** ([ADR-010](./ADR-010-docker-first.md)): per-app images built with `pnpm deploy --filter=<app>` / `turbo prune --scope=<app>` to produce a minimal, isolated context per service.

This decision is **canon-binding** ([Canon §2](../context/architecture.md#2-canonical-architecture-decisions-one-line--adr-id)): no app or package may be split into a separate repository or use an alternate package manager without a superseding ADR.

---

## 4. Consequences → Pros

- **Atomic, reviewable cross-cutting changes.** A contract change in `packages/types` and all producer/consumer updates land in one PR, eliminating version-skew between server contracts and the `sdk`/`realtime` clients.
- **Fast, incremental CI.** Turborepo skips unchanged units and replays cached outputs; the 90% coverage gate ([Canon §10](../context/architecture.md#10-cross-cutting-non-negotiables)) runs only where code actually changed, keeping pipeline times near-constant as the repo grows.
- **Enforced module boundaries.** pnpm's strict, non-hoisted `node_modules` makes phantom dependencies a hard error, structurally enforcing the per-package isolation Canon requires.
- **Reproducibility from dev to production.** A single `pnpm-lock.yaml` + pinned toolchain yields byte-identical dependency resolution across local, VPS, Vercel, and prod, dovetailing with Docker-first delivery ([ADR-010](./ADR-010-docker-first.md)).
- **Recoverability (R2).** All code, ADRs, specs, history, and `project-state/` live in one versioned tree, so the full project context is recoverable from any commit — directly serving the context-window-exhaustion guarantee.
- **Unified DX.** One clone, one `pnpm install`, one `turbo dev` brings up the whole graph; no registry publishing or `npm link` for internal packages.
- **Efficient disk + images.** pnpm's content-addressed global store deduplicates packages across all 12 units, and `turbo prune` yields lean per-service Docker contexts.

---

## 5. Consequences → Cons

- **Higher initial tooling setup.** Two coordinated tools (pnpm + Turborepo) plus `turbo.json` pipeline tuning and cache configuration, versus a single package manager.
- **Symlink-aware tooling required.** pnpm's symlinked layout can surprise bundlers and the Electron packager ([ADR-006](./ADR-006-electron-desktop.md)); some need `shamefully-hoist` scoped via `.npmrc` or explicit `public-hoist-pattern` entries.
- **Remote cache is operational surface.** To get cross-machine cache reuse in CI/Docker we must run or subscribe to a remote cache, adding a dependency and an auth secret to manage.
- **Single CI blast radius (perceived).** A misconfigured root affects all units; mitigated by Turbo's `--filter` scoping and required-checks-per-path, but the root config is a shared critical asset.
- **Repo growth over time.** A large monorepo needs deliberate `.gitignore`, shallow/partial clone, and `repomix` snapshots to stay navigable for both humans and AI agents.

---

## 6. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Phantom-dependency assumptions** in third-party tools that expect a flat `node_modules` (bundlers, Electron-builder). | Medium | Medium | Use scoped `public-hoist-pattern` / `shamefully-hoist` in `.npmrc` only where required; pin `node-linker` behavior; add a smoke build of `apps/desktop` to CI. |
| **Turbo cache poisoning / stale outputs** (incorrect `inputs`/`outputs` declarations cause wrong cache hits). | Medium | High | Precisely declare each task's `inputs`/`outputs`; include lockfile + env in the hash; provide `turbo run <task> --force` escape hatch; verify cache correctness in CI by a periodic no-cache run. |
| **Remote cache outage or secret leak** blocks or slows CI. | Low | Medium | Local cache fallback (Turbo degrades gracefully to local on remote miss); scope cache tokens read-only for forks; rotate secrets via the secret store ([Canon §10](../context/architecture.md#10-cross-cutting-non-negotiables)). |
| **Toolchain drift** (contributor on a different Node/pnpm version) breaks reproducibility. | Medium | Medium | Pin `engines`, set `packageManager` and enforce via Corepack; CI fails on version mismatch; document in `docs/`. |
| **Circular dependencies** between packages break topological build ordering. | Low | High | Enforce the acyclic layering `types → shared/database → sdk/realtime/auth/social/ui → apps`; add a CI lint (e.g. dependency-cruiser / `pnpm` cycle check) that fails on cycles. |
| **Monorepo onboarding / navigation cost** for new agents and contributors. | Medium | Low | Maintain `repomix/` packed snapshots (R3/R4), keep `context/architecture.md` authoritative, and provide root `README` + `docs/` orientation. |
| **CI blast radius** from a bad root config change. | Low | High | Treat `turbo.json`, `pnpm-workspace.yaml`, root `package.json` as protected paths requiring extra review; use path-filtered required checks. |

---

## 7. Future Considerations

- **Remote cache hosting choice.** Start on Vercel Remote Cache for zero-ops; revisit a self-hosted cache server if egress, data-residency, or cost warrants it. Either is config-only and transparent to task definitions.
- **Serverless/edge transports.** When the realtime layer gains `VercelEdgeTransport` / `DurableObjectTransport` adapters ([ADR-004](./ADR-004-realtime-abstraction.md)), the monorepo will host additional edge/worker build targets; Turborepo pipelines extend with new tasks without restructuring the repo.
- **Scaling task orchestration.** If the graph outgrows Turborepo's ergonomics, Nx is a drop-in-adjacent migration path that preserves the pnpm-workspace foundation; this ADR's pnpm decision is independent of the orchestrator and would not need revisiting.
- **Code ownership at scale.** Introduce `CODEOWNERS` mapped to the AI agent role ownership (Backend, Frontend, Realtime, etc.) and path-scoped required reviews as the team grows.
- **Selective publishing.** Should any package (e.g. `packages/sdk`) ever need external distribution, add a Changesets-based release flow scoped to that package only — the monorepo supports selective publish without becoming a polyrepo.
- **Build performance telemetry.** Wire Turbo run summaries into the observability stack ([Canon §10](../context/architecture.md#10-cross-cutting-non-negotiables)) to track cache hit-rate and CI duration over time and tune `inputs`/`outputs` accordingly.

---

_This ADR complies with and is governed by the [Cowatch Architecture Canon](../context/architecture.md). Any change to this decision requires a superseding ADR plus a history entry, context update, and repomix update (R3/R4)._
