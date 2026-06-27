# packages/ui — Shared UI Component Library

> One-line purpose: The shared shadcn/ui + Radix + Tailwind component library consumed by every front-end app (web, desktop renderer, landing).

**Status:** Placeholder — Phase 0 (Architecture). **No code yet** (rule R1: plan before code). This README documents the planned shape of `packages/ui`.
**Owner agent:** Frontend Engineer
**Last updated: 2026-06-27**

**Canon & cross-links**

- Architecture canon: [../../context/architecture.md](../../context/architecture.md)
- Repository map: [../../INDEX.md](../../INDEX.md)
- Governing doc: [UI](../../docs/UI.md)

---

## Purpose

`packages/ui` is the **single source of reusable presentational components and design primitives** for Cowatch. It exists so the web app, the Electron renderer, and the landing site share one accessible, themeable component set — buttons, dialogs, menus, avatars, toasts, form controls — rather than each app reinventing them. It is purely presentational: no API calls, no domain logic, no realtime wiring.

## Owning agent

**Frontend Engineer.**

## Planned tech

| Concern | Choice |
|---|---|
| Base | shadcn/ui patterns over Radix UI primitives |
| Styling | TailwindCSS (shared preset/tokens) |
| Animation | Framer Motion wrappers where motion is part of a component |
| Language | TypeScript, React |
| Distribution | Source package consumed via the monorepo (Turborepo build/cache) |

## Planned contents

```
packages/ui/
  src/
    components/          # Button, Dialog, DropdownMenu, Avatar, Tooltip, Toast, ...
    primitives/          # thin Radix wrappers + variants (cva)
    theme/               # tailwind preset, design tokens, dark/light
    hooks/               # presentational hooks (useCamelCase.ts)
    index.ts             # barrel (one per package only, canon §3)
```

- React components: `PascalCase.tsx`; hooks: `useCamelCase.ts`; exactly **one barrel `index.ts`** per package (canon §3).
- No domain types here; if a component needs a shape, it takes generic props — domain types live in [packages/types](../types/README.md).

## Consumers

- [apps/web](../../apps/web/README.md), [apps/desktop](../../apps/desktop/README.md) (renderer), [apps/landing](../../apps/landing/README.md).

## Which docs/specs govern this package

- **Primary doc:** [UI.md](../../docs/UI.md) — design system, component inventory, theming.
- **Specs:** any component-system spec in [../../specs/](../../specs/).
- **Phase:** seeded early in **Phase 1** and grown continuously as feature surfaces are built.

## Status notes

Empty today. First components land alongside the Phase 1 auth screens.
