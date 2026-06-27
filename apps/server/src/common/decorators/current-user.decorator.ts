import {
  createParamDecorator,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';

/** The authenticated principal attached to the request by `JwtAuthGuard`. */
export interface AuthContext {
  userId: string;
  sessionId: string;
  roles: string[];
  isGuest: boolean;
}

export type AuthedRequest = Request & { auth?: AuthContext };

/** Injects the `AuthContext`; throws if the route was not guarded. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext => {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!req.auth) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Not authenticated.',
      });
    }
    return req.auth;
  },
);
