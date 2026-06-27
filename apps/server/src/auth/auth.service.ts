import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import {
  DevicePlatform,
  UserKind,
  type AuthResult,
  type AuthTokens,
  type PublicUser,
  type SelfUser,
  type SessionSummary,
} from '@cowatch/types';
import type { User } from '@cowatch/database';
import type { Env } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { SessionService, type DeviceInput } from './session.service';
import type { RegisterDto } from './dto/register.dto';
import type { LoginDto } from './dto/login.dto';

/** Orchestrates the email/password + session auth flows (Phase 1, Slice 1). */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly sessions: SessionService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async register(dto: RegisterDto, device: DeviceInput): Promise<AuthResult> {
    const email = dto.email.trim();
    const emailLower = email.toLowerCase();
    const username = dto.username.trim();
    const usernameLower = username.toLowerCase();

    const [emailTaken, usernameTaken] = await Promise.all([
      this.prisma.user.findUnique({ where: { emailLower } }),
      this.prisma.user.findUnique({ where: { usernameLower } }),
    ]);
    if (emailTaken) {
      throw new ConflictException({
        code: 'EMAIL_TAKEN',
        message: 'That email is already registered.',
      });
    }
    if (usernameTaken) {
      throw new ConflictException({
        code: 'USERNAME_TAKEN',
        message: 'That username is taken.',
      });
    }

    const passwordHash = await this.passwords.hash(dto.password);
    const user = await this.prisma.user.create({
      data: {
        kind: 'registered',
        email,
        emailLower,
        passwordHash,
        usernameLower,
        profile: {
          username,
          displayName: username,
          avatarUrl: null,
          bio: null,
        },
        presence: { status: 'offline', lastActiveAt: null },
      },
    });

    return this.issue(user, device);
  }

  async login(dto: LoginDto, device: DeviceInput): Promise<AuthResult> {
    const emailLower = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { emailLower } });
    const ok =
      user?.passwordHash != null
        ? await this.passwords.verify(user.passwordHash, dto.password)
        : false;
    if (user === null || !ok || user.deletedAt !== null) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      });
    }
    return this.issue(user, device);
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    const rotated = await this.sessions.rotate(refreshToken);
    const user = await this.prisma.user.findUnique({
      where: { id: rotated.userId },
    });
    if (user === null || user.deletedAt !== null) {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Account unavailable.',
      });
    }
    const accessToken = await this.tokens.signAccessToken({
      userId: user.id,
      sessionId: rotated.sessionId,
      roles: [],
      isGuest: user.kind === 'guest',
    });
    return {
      user: this.toPublicUser(user),
      tokens: this.bundle(accessToken, rotated.refreshToken),
    };
  }

  async logout(sessionId: string): Promise<void> {
    await this.sessions.revoke(sessionId);
  }

  async getSelf(userId: string): Promise<SelfUser | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user === null || user.deletedAt !== null) return null;
    return this.toSelfUser(user);
  }

  /** Creates an ephemeral guest account (no email/password) and signs it in. */
  async createGuest(device: DeviceInput): Promise<AuthResult> {
    const username = `guest-${randomBytes(4).toString('hex')}`;
    const ttl = this.config.get('AUTH_GUEST_TTL', { infer: true });
    const user = await this.prisma.user.create({
      data: {
        kind: 'guest',
        usernameLower: username.toLowerCase(),
        profile: {
          username,
          displayName: username,
          avatarUrl: null,
          bio: null,
        },
        presence: { status: 'offline', lastActiveAt: null },
        guestExpiresAt: new Date(Date.now() + ttl * 1000),
      },
    });
    return this.issue(user, device);
  }

  /**
   * Upgrades the current guest account in place to a full registered account
   * (keeping its id and sessions). Fails if the account is not a guest or the
   * chosen email/username is taken.
   */
  async upgradeGuest(userId: string, dto: RegisterDto): Promise<SelfUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user === null || user.deletedAt !== null) {
      throw new UnauthorizedException({
        code: 'ACCOUNT_UNAVAILABLE',
        message: 'Account unavailable.',
      });
    }
    if (user.kind !== 'guest') {
      throw new ConflictException({
        code: 'NOT_A_GUEST',
        message: 'This account is already registered.',
      });
    }

    const email = dto.email.trim();
    const emailLower = email.toLowerCase();
    const username = dto.username.trim();
    const usernameLower = username.toLowerCase();

    const [emailTaken, usernameTaken] = await Promise.all([
      this.prisma.user.findUnique({ where: { emailLower } }),
      this.prisma.user.findUnique({ where: { usernameLower } }),
    ]);
    if (emailTaken) {
      throw new ConflictException({
        code: 'EMAIL_TAKEN',
        message: 'That email is already registered.',
      });
    }
    if (usernameTaken !== null && usernameTaken.id !== user.id) {
      throw new ConflictException({
        code: 'USERNAME_TAKEN',
        message: 'That username is taken.',
      });
    }

    const passwordHash = await this.passwords.hash(dto.password);
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        kind: 'registered',
        email,
        emailLower,
        passwordHash,
        usernameLower,
        guestExpiresAt: null,
        profile: {
          set: {
            username,
            displayName: username,
            avatarUrl: null,
            bio: null,
          },
        },
      },
    });
    return this.toSelfUser(updated);
  }

  async listSessions(
    userId: string,
    currentSessionId: string,
  ): Promise<SessionSummary[]> {
    const list = await this.sessions.listForUser(userId);
    const now = Date.now();
    return list.map((s) => ({
      id: s.id,
      current: s.id === currentSessionId,
      platform:
        s.device.platform === 'desktop'
          ? DevicePlatform.Desktop
          : DevicePlatform.Web,
      label: s.device.label ?? null,
      lastSeenAt: s.lastSeenAt.toISOString(),
      createdAt: s.createdAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      revoked: s.revokedAt !== null || s.expiresAt.getTime() <= now,
    }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    await this.sessions.revokeOwned(userId, sessionId);
  }

  async revokeOtherSessions(
    userId: string,
    keepSessionId: string,
  ): Promise<number> {
    return this.sessions.revokeOthers(userId, keepSessionId);
  }

  private async issue(user: User, device: DeviceInput): Promise<AuthResult> {
    const { sessionId, refreshToken } = await this.sessions.create(
      user.id,
      device,
    );
    const accessToken = await this.tokens.signAccessToken({
      userId: user.id,
      sessionId,
      roles: [],
      isGuest: user.kind === 'guest',
    });
    return {
      user: this.toPublicUser(user),
      tokens: this.bundle(accessToken, refreshToken),
    };
  }

  private bundle(accessToken: string, refreshToken: string): AuthTokens {
    return {
      accessToken,
      refreshToken,
      accessExpiresIn: this.tokens.accessTtlSeconds(),
      tokenType: 'Bearer',
    };
  }

  private toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      kind: user.kind === 'guest' ? UserKind.Guest : UserKind.Registered,
      username: user.profile.username,
      displayName: user.profile.displayName,
      avatarUrl: user.profile.avatarUrl ?? null,
      isGuest: user.kind === 'guest',
      emailVerified: user.emailVerifiedAt !== null,
      createdAt: user.createdAt.toISOString(),
    };
  }

  private toSelfUser(user: User): SelfUser {
    return {
      ...this.toPublicUser(user),
      email: user.email ?? null,
      totpEnabled: user.totpEnabled,
    };
  }
}
