import type { Id, IsoDateTime } from './common';
import type { PublicUser } from './user';

/** Identity providers a user can authenticate with (canon §8). */
export enum AuthProvider {
  Password = 'password',
  Google = 'google',
  Guest = 'guest',
}

/** Client platform a device session was created from. */
export enum DevicePlatform {
  Web = 'web',
  Desktop = 'desktop',
}

/** Discriminates the two token kinds in the auth system. */
export enum TokenKind {
  Access = 'access',
  Refresh = 'refresh',
}

/**
 * Claims embedded in the signed (RS256) access JWT — canon §8.
 * Kept deliberately small: room roles are resolved per-room at request time,
 * never carried in the token.
 */
export interface AccessTokenClaims {
  /** Subject — the user id. */
  sub: Id;
  /** Session id — the device session this token belongs to. */
  sid: Id;
  /** Token kind discriminator. */
  kind: TokenKind.Access;
  /** Effective global roles (not room roles). */
  roles: string[];
  /** Whether the subject is a guest account. */
  isGuest: boolean;
}

/** Token bundle returned by auth flows. */
export interface AuthTokens {
  accessToken: string;
  /**
   * Opaque rotating refresh token of the form `<sessionId>.<secret>`.
   * Delivered to browsers as an httpOnly, Secure, SameSite cookie by the HTTP
   * layer; never readable by client JS.
   */
  refreshToken: string;
  /** Access-token lifetime in seconds. */
  accessExpiresIn: number;
  tokenType: 'Bearer';
}

/** Full result of a successful authentication. */
export interface AuthResult {
  user: PublicUser;
  tokens: AuthTokens;
}

/** A redacted view of one device session, for the session-management UI. */
export interface SessionSummary {
  id: Id;
  /** True if this is the session the requesting access token belongs to. */
  current: boolean;
  platform: DevicePlatform;
  label: string | null;
  lastSeenAt: IsoDateTime;
  createdAt: IsoDateTime;
  expiresAt: IsoDateTime;
  /** True if revoked or expired (i.e. no longer usable). */
  revoked: boolean;
}
