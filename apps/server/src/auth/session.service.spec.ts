import { UnauthorizedException } from '@nestjs/common';
import { DevicePlatform } from '@cowatch/types';
import { SessionService } from './session.service';
import { makeConfig, makeTokenService } from '../../test/test-utils';
import { createInMemoryPrisma } from '../../test/in-memory-prisma';
import type { Env } from '../config/env.validation';

async function seedUser(
  prisma: ReturnType<typeof createInMemoryPrisma>,
  kind: 'registered' | 'guest' = 'registered',
): Promise<{ id: string }> {
  return prisma.user.create({
    data: {
      kind,
      usernameLower: `u-${Math.random().toString(36).slice(2)}`,
      profile: {
        username: 'u',
        displayName: 'u',
        avatarUrl: null,
        bio: null,
      },
      presence: { status: 'offline', lastActiveAt: null },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any) as Promise<{ id: string }>;
}

function setup(envOverrides: Partial<Env> = {}) {
  const config = makeConfig(envOverrides);
  const tokens = makeTokenService(config);
  const prisma = createInMemoryPrisma();
  const sessions = new SessionService(prisma, tokens, config);
  return { sessions, prisma, tokens };
}

describe('SessionService', () => {
  it('creates a session and issues a composite refresh token', async () => {
    const { sessions, prisma } = setup();
    const user = await seedUser(prisma);
    const { sessionId, refreshToken } = await sessions.create(user.id, {
      platform: DevicePlatform.Web,
    });
    expect(sessionId).toHaveLength(24);
    expect(refreshToken.startsWith(`${sessionId}.`)).toBe(true);
    expect(await sessions.isActive(sessionId)).toBe(true);
  });

  it('rotates a valid refresh token to a new one', async () => {
    const { sessions, prisma } = setup();
    const user = await seedUser(prisma);
    const { refreshToken } = await sessions.create(user.id, {
      platform: DevicePlatform.Web,
    });
    const rotated = await sessions.rotate(refreshToken);
    expect(rotated.refreshToken).not.toEqual(refreshToken);
    expect(rotated.userId).toBe(user.id);
  });

  it('detects reuse of a superseded token and revokes the session', async () => {
    const { sessions, prisma } = setup({ AUTH_REFRESH_REUSE_GRACE: 0 });
    const user = await seedUser(prisma);
    const { sessionId, refreshToken } = await sessions.create(user.id, {
      platform: DevicePlatform.Web,
    });
    await sessions.rotate(refreshToken); // original is now superseded
    await expect(sessions.rotate(refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(await sessions.isActive(sessionId)).toBe(false);
  });

  it('rejects a malformed or unknown refresh token', async () => {
    const { sessions } = setup();
    await expect(sessions.rotate('garbage')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(
      sessions.rotate('0123456789abcdef01234567.deadbeef'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('revokes all sessions for a user', async () => {
    const { sessions, prisma } = setup();
    const user = await seedUser(prisma);
    const a = await sessions.create(user.id, { platform: DevicePlatform.Web });
    const b = await sessions.create(user.id, {
      platform: DevicePlatform.Desktop,
    });
    const count = await sessions.revokeAllForUser(user.id);
    expect(count).toBe(2);
    expect(await sessions.isActive(a.sessionId)).toBe(false);
    expect(await sessions.isActive(b.sessionId)).toBe(false);
  });
});
