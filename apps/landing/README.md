# apps/landing — Cowatch Marketing Landing Site

> One-line purpose: The public marketing site that explains Cowatch, showcases features, and funnels visitors into sign-up / app download.

**Status:** Placeholder — Phase 0 (Architecture). **No application code yet** (rule R1: plan before code). This README documents the planned shape of `apps/landing`.
**Owner agent:** Frontend Engineer
**Last updated: 2026-06-27**

**Canon & cross-links**

- Architecture canon: [../../context/architecture.md](../../context/architecture.md)
- Repository map: [../../INDEX.md](../../INDEX.md)
- Governing docs: [PRD](../../docs/PRD.md) · [UI](../../docs/UI.md) · [DEPLOYMENT](../../docs/DEPLOYMENT.md)

---

## Purpose

`apps/landing` is the **top-of-funnel marketing site**, separate from the authenticated product ([apps/web](../web/README.md)). Its job is conversion and trust: communicate what Cowatch is (Discord-like synchronized watch parties), show the feature set, and route visitors to sign-up or desktop download. It is mostly static/content-driven and SEO-friendly, with no authenticated product surface of its own.

## Owning agent

**Frontend Engineer** (content contributed by Product).

## Planned tech

| Concern | Choice |
|---|---|
| Framework | React + TypeScript (Vite) — consistent with the monorepo front-end stack |
| Styling | TailwindCSS |
| Components | [packages/ui](../../packages/ui/README.md) for shared primitives + marketing-specific blocks |
| Animation | Framer Motion (hero/feature reveals) |
| Hosting | Docker image; deployable to Vercel/VPS per [DEPLOYMENT.md](../../docs/DEPLOYMENT.md) |

> The exact rendering strategy (static prerender vs. SSR/SSG) is an open question — see below.

## Planned contents

```
apps/landing/
  src/
    sections/            # hero, features, how-it-works, pricing, FAQ, footer
    pages/               # /, /features, /download, /pricing, /legal/*
    components/          # marketing-specific composites
  public/                # static assets, OG images, favicons
  vite.config.ts
```

- React components: `PascalCase.tsx`; folders `kebab-case` (canon §3).
- Shared visual primitives come from [packages/ui](../../packages/ui/README.md); marketing-only blocks live here.

## Which docs/specs govern this app

- **Primary docs:** [PRD.md](../../docs/PRD.md) (messaging and positioning), [UI.md](../../docs/UI.md) (design system), [DEPLOYMENT.md](../../docs/DEPLOYMENT.md) (hosting target).
- **Specs:** marketing/landing specs in [../../specs/](../../specs/) (if/when authored, R5).
- **Phase:** typically built in parallel late in the timeline (around **Phase 12 / launch**); not on the critical path for the product.

## Open questions

- **Rendering strategy:** static prerender vs. SSG/SSR for SEO. *Recommendation:* start with a statically prerendered Vite build (simplest, best Docker parity); revisit SSR only if dynamic/localized marketing content demands it.

## Status notes

Empty of source today. Lowest priority among the apps; scaffolded near launch.
