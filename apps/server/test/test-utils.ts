import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../src/config/env.validation';
import { KeyProvider } from '../src/auth/key.provider';
import { TokenService } from '../src/auth/token.service';

/** A `ConfigService` stand-in backed by a plain typed env object. */
export function makeConfig(overrides: Partial<Env> = {}): ConfigService<Env, true> {
  const values: Env = {
    NODE_ENV: 'test',
    PORT: 3000,
    DATABASE_URL: 'mongodb://localhost:27017/test?replicaSet=rs0',
    AUTH_JWT_PRIVATE_KEY: undefined,
    AUTH_JWT_PUBLIC_KEY: undefined,
    AUTH_ACCESS_TTL: 900,
    AUTH_REFRESH_TTL: 60 * 60 * 24 * 30,
    AUTH_REFRESH_REUSE_GRACE: 10,
    AUTH_GUEST_TTL: 60 * 60 * 24,
    AUTH_ISSUER: 'cowatch',
    COOKIE_DOMAIN: undefined,
    COOKIE_SECURE: false,
    ...overrides,
  };
  return {
    get: (key: keyof Env) => values[key],
  } as unknown as ConfigService<Env, true>;
}

/** A real `TokenService` wired with an ephemeral RS256 keypair for tests. */
export function makeTokenService(
  config: ConfigService<Env, true> = makeConfig(),
): TokenService {
  const keys = new KeyProvider(config);
  return new TokenService(new JwtService({}), keys, config);
}
