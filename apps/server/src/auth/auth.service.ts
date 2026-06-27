import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  UserKind,
  type AuthResult,
  type AuthTokens,
  type PublicUser,
  type SelfUser,
} from '@cowatch/types';
import type { User } from '@cowatch/database';
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
