import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { TokenKind, type AccessTokenClaims } from '@cowatch/types';
import type { Env } from '../config/env.validation';
import { KeyProvider } from './key.provider';

export interface AccessTokenInput {
  userId: string;
  sessionId: string;
  roles: string[];
  isGuest: boolean;
}

/**
 * Issues/verifies the two token types (canon §8):
 *  - Access: short-lived RS256 JWT carrying `sub`/`sid`/`kind`/`roles`/`isGuest`.
 *  - Refresh: opaque `<sessionId>.<secret>`; only the SHA-256 of `secret` is
 *    ever persisted (on the session's token family), never the secret itself.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly keys: KeyProvider,
    private readonly config: ConfigService<Env, true>,
  ) {}

  signAccessToken(input: AccessTokenInput): Promise<string> {
    const claims: AccessTokenClaims = {
      sub: input.userId,
      sid: input.sessionId,
      kind: TokenKind.Access,
      roles: input.roles,
      isGuest: input.isGuest,
    };
    return this.jwt.signAsync(claims, {
      algorithm: 'RS256',
      privateKey: this.keys.privateKey,
      expiresIn: this.config.get('AUTH_ACCESS_TTL', { infer: true }),
      issuer: this.config.get('AUTH_ISSUER', { infer: true }),
    });
  }

  verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    return this.jwt.verifyAsync<AccessTokenClaims>(token, {
      algorithms: ['RS256'],
      publicKey: this.keys.publicKey,
      issuer: this.config.get('AUTH_ISSUER', { infer: true }),
    });
  }

  accessTtlSeconds(): number {
    return this.config.get('AUTH_ACCESS_TTL', { infer: true });
  }

  /** New random refresh secret plus its at-rest SHA-256 hash. */
  issueRefreshSecret(): { secret: string; hash: string } {
    const secret = randomBytes(32).toString('base64url');
    return { secret, hash: this.hashSecret(secret) };
  }

  hashSecret(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
  }

  /** Constant-time comparison of two equal-length hex digests. */
  safeEqualHex(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'hex');
    const bufB = Buffer.from(b, 'hex');
    if (bufA.length !== bufB.length || bufA.length === 0) return false;
    return timingSafeEqual(bufA, bufB);
  }

  composeRefreshToken(sessionId: string, secret: string): string {
    return `${sessionId}.${secret}`;
  }

  parseRefreshToken(
    token: string,
  ): { sessionId: string; secret: string } | null {
    const idx = token.indexOf('.');
    if (idx <= 0 || idx >= token.length - 1) return null;
    return { sessionId: token.slice(0, idx), secret: token.slice(idx + 1) };
  }
}
