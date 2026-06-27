import { z } from 'zod';

/**
 * Environment contract for apps/server. Validated once at boot via
 * `@nestjs/config`'s `validate` hook — a misconfigured server fails fast and
 * loudly instead of erroring deep in a request (canon §10).
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z
    .string()
    .min(1)
    .default('mongodb://localhost:27017/cowatch?replicaSet=rs0'),

  // --- Auth / tokens (canon §8, ADR-008) ---
  /** PEM RS256 private key for signing access tokens. Required in production. */
  AUTH_JWT_PRIVATE_KEY: z.string().optional(),
  /** PEM RS256 public key for verifying access tokens. Required in production. */
  AUTH_JWT_PUBLIC_KEY: z.string().optional(),
  /** Access-token lifetime in seconds (default 15 min). */
  AUTH_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  /** Refresh-token lifetime in seconds (default 30 days). */
  AUTH_REFRESH_TTL: z.coerce.number().int().positive().default(60 * 60 * 24 * 30),
  /** Grace window (seconds) where a just-rotated refresh token is still accepted. */
  AUTH_REFRESH_REUSE_GRACE: z.coerce.number().int().nonnegative().default(10),
  AUTH_ISSUER: z.string().min(1).default('cowatch'),

  // --- Cookies ---
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

export type Env = z.infer<typeof envSchema>;

/** `@nestjs/config` validate hook: returns the typed, coerced config or throws. */
export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return parsed.data;
}
