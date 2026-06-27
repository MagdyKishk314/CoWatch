import type { Id, IsoDateTime } from './common';

/** Whether an account is a full registered account or an ephemeral guest. */
export enum UserKind {
  Registered = 'registered',
  Guest = 'guest',
}

/** Coarse presence state (derived from realtime connections in later phases). */
export enum PresenceStatus {
  Online = 'online',
  Idle = 'idle',
  Dnd = 'dnd',
  Offline = 'offline',
}

/**
 * The safe, public projection of a user. NEVER includes `passwordHash`,
 * `email`, TOTP secrets, or any other sensitive field. This is the only user
 * shape that crosses the API boundary to other users.
 */
export interface PublicUser {
  id: Id;
  kind: UserKind;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isGuest: boolean;
  emailVerified: boolean;
  createdAt: IsoDateTime;
}

/** The self-view of a user — includes own email/verification, still no secrets. */
export interface SelfUser extends PublicUser {
  email: string | null;
  totpEnabled: boolean;
}
