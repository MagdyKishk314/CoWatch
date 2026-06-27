import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { DevicePlatform } from '@cowatch/types';
import { PrismaService } from '../prisma/prisma.service';
import { TokenService } from './token.service';
import type { Env } from '../config/env.validation';

export interface DeviceInput {
  platform: DevicePlatform;
  userAgent?: string | undefined;
  ipRegion?: string | undefined;
  label?: string | undefined;
}

export interface RotationResult {
  userId: string;
  sessionId: string;
  refreshToken: string;
  isGuest: boolean;
}

/**
 * Owns the device-session lifecycle and rotating-refresh-token semantics
 * (canon §8 / ADR-008): create, rotate-with-reuse-detection, and revoke.
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Opens a new device session and returns its first refresh token. */
  async create(
    userId: string,
    device: DeviceInput,
  ): Promise<{ sessionId: string; refreshToken: string }> {
    const { secret, hash } = this.tokens.issueRefreshSecret();
    const ttl = this.config.get('AUTH_REFRESH_TTL', { infer: true });
    const now = new Date();

    const session = await this.prisma.session.create({
      data: {
        userId,
        device: {
          platform: device.platform,
          userAgent: device.userAgent ?? null,
          ipRegion: device.ipRegion ?? null,
          label: device.label ?? null,
        },
        tokenFamily: {
          familyId: randomUUID(),
          currentHash: hash,
          previousHash: null,
          rotatedAt: now,
          reuseDetectedAt: null,
        },
        lastSeenAt: now,
        expiresAt: new Date(now.getTime() + ttl * 1000),
      },
    });

    return {
      sessionId: session.id,
      refreshToken: this.tokens.composeRefreshToken(session.id, secret),
    };
  }

  /**
   * Validates a presented refresh token and rotates it. Detects reuse of an
   * already-rotated token (outside the grace window) as theft and revokes the
   * session/family.
   */
  async rotate(refreshToken: string): Promise<RotationResult> {
    const parsed = this.tokens.parseRefreshToken(refreshToken);
    if (!parsed) {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Malformed refresh token.',
      });
    }

    const session = await this.prisma.session.findUnique({
      where: { id: parsed.sessionId },
      include: { user: true },
    });
    if (
      !session ||
      session.revokedAt !== null ||
      session.expiresAt.getTime() <= Date.now()
    ) {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Session not found, revoked, or expired.',
      });
    }

    const presentedHash = this.tokens.hashSecret(parsed.secret);
    const fam = session.tokenFamily;
    const matchesCurrent = this.tokens.safeEqualHex(
      presentedHash,
      fam.currentHash,
    );
    const graceMs =
      this.config.get('AUTH_REFRESH_REUSE_GRACE', { infer: true }) * 1000;
    const withinGrace =
      fam.previousHash !== null &&
      this.tokens.safeEqualHex(presentedHash, fam.previousHash) &&
      Date.now() - fam.rotatedAt.getTime() < graceMs;

    if (!matchesCurrent && !withinGrace) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: {
          revokedAt: new Date(),
          tokenFamily: {
            set: { ...fam, reuseDetectedAt: new Date() },
          },
        },
      });
      this.logger.warn(
        `Refresh-token reuse detected for session ${session.id}; family revoked.`,
      );
      throw new UnauthorizedException({
        code: 'REFRESH_TOKEN_REUSE',
        message: 'Refresh token reuse detected; session revoked.',
      });
    }

    const { secret, hash } = this.tokens.issueRefreshSecret();
    const now = new Date();
    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        lastSeenAt: now,
        tokenFamily: {
          set: {
            familyId: fam.familyId,
            currentHash: hash,
            previousHash: fam.currentHash,
            rotatedAt: now,
            reuseDetectedAt: null,
          },
        },
      },
    });

    return {
      userId: session.userId,
      sessionId: session.id,
      refreshToken: this.tokens.composeRefreshToken(session.id, secret),
      isGuest: session.user.kind === 'guest',
    };
  }

  async revoke(sessionId: string): Promise<void> {
    try {
      await this.prisma.session.update({
        where: { id: sessionId },
        data: { revokedAt: new Date() },
      });
    } catch {
      // Idempotent: revoking an unknown/already-gone session is a no-op.
    }
  }

  async revokeAllForUser(userId: string): Promise<number> {
    const res = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return res.count;
  }

  async isActive(sessionId: string): Promise<boolean> {
    const s = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });
    return (
      s !== null && s.revokedAt === null && s.expiresAt.getTime() > Date.now()
    );
  }
}
