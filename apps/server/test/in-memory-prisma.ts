import { randomBytes } from 'node:crypto';
import type { PrismaService } from '../src/prisma/prisma.service';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Rec = Record<string, any>;

function oid(): string {
  return randomBytes(12).toString('hex');
}

/**
 * A tiny in-memory stand-in for the subset of the Prisma client the auth code
 * uses (user + session delegates). Lets the full HTTP/DI/guard/token-rotation
 * path run in tests without a live MongoDB. Swap in a real client (Atlas /
 * Docker / mongodb-memory-server replica set) for true DB integration.
 */
export function createInMemoryPrisma(): PrismaService & { _reset: () => void } {
  const users: Rec[] = [];
  const sessions: Rec[] = [];

  const user = {
    findUnique: async ({ where }: { where: Rec }) =>
      users.find(
        (u) =>
          (where.id !== undefined && u.id === where.id) ||
          (where.emailLower !== undefined &&
            u.emailLower === where.emailLower) ||
          (where.usernameLower !== undefined &&
            u.usernameLower === where.usernameLower) ||
          (where.googleId !== undefined && u.googleId === where.googleId),
      ) ?? null,
    create: async ({ data }: { data: Rec }) => {
      const now = new Date();
      const rec: Rec = {
        id: oid(),
        kind: data.kind ?? 'registered',
        email: data.email ?? null,
        emailLower: data.emailLower ?? null,
        emailVerifiedAt: data.emailVerifiedAt ?? null,
        passwordHash: data.passwordHash ?? null,
        googleId: data.googleId ?? null,
        totpEnabled: data.totpEnabled ?? false,
        totpSecretEnc: data.totpSecretEnc ?? null,
        recoveryCodeHashes: data.recoveryCodeHashes ?? [],
        profile: data.profile,
        usernameLower: data.usernameLower,
        presence: data.presence,
        guestExpiresAt: data.guestExpiresAt ?? null,
        deletedAt: data.deletedAt ?? null,
        createdAt: now,
        updatedAt: now,
      };
      users.push(rec);
      return rec;
    },
  };

  const session = {
    create: async ({ data }: { data: Rec }) => {
      const now = new Date();
      const rec: Rec = {
        id: oid(),
        userId: data.userId,
        device: data.device,
        tokenFamily: data.tokenFamily,
        lastSeenAt: data.lastSeenAt ?? now,
        expiresAt: data.expiresAt,
        revokedAt: data.revokedAt ?? null,
        createdAt: now,
        updatedAt: now,
      };
      sessions.push(rec);
      return rec;
    },
    findUnique: async ({
      where,
      include,
    }: {
      where: Rec;
      include?: Rec;
    }) => {
      const s = sessions.find((x) => x.id === where.id) ?? null;
      if (s !== null && include?.user) {
        return { ...s, user: users.find((u) => u.id === s.userId) ?? null };
      }
      return s;
    },
    update: async ({ where, data }: { where: Rec; data: Rec }) => {
      const s = sessions.find((x) => x.id === where.id);
      if (s === undefined) throw new Error('Session not found');
      if (data.revokedAt !== undefined) s.revokedAt = data.revokedAt;
      if (data.lastSeenAt !== undefined) s.lastSeenAt = data.lastSeenAt;
      if (data.tokenFamily !== undefined) {
        s.tokenFamily = data.tokenFamily.set ?? data.tokenFamily;
      }
      s.updatedAt = new Date();
      return s;
    },
    updateMany: async ({ where, data }: { where: Rec; data: Rec }) => {
      let count = 0;
      for (const s of sessions) {
        const matchUser =
          where.userId === undefined || s.userId === where.userId;
        const matchRevoked =
          where.revokedAt === undefined || s.revokedAt === where.revokedAt;
        if (matchUser && matchRevoked) {
          if (data.revokedAt !== undefined) s.revokedAt = data.revokedAt;
          s.updatedAt = new Date();
          count += 1;
        }
      }
      return { count };
    },
  };

  const fake = {
    user,
    session,
    $connect: async () => undefined,
    $disconnect: async () => undefined,
    _reset: () => {
      users.length = 0;
      sessions.length = 0;
    },
  };
  return fake as unknown as PrismaService & { _reset: () => void };
}
