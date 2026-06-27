/**
 * @cowatch/database — the single import surface for the generated Prisma client
 * and its types. Framework-agnostic on purpose: the NestJS `PrismaService`
 * wrapper lives in `apps/server`, so this package stays usable from scripts,
 * workers, and tests without a Nest dependency.
 *
 * Run `pnpm --filter @cowatch/database generate` (or `pnpm build`) to produce
 * the client before consuming this module.
 */
export * from '@prisma/client';
