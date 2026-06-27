import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { TokenKind, type AccessTokenClaims } from '@cowatch/types';
import { TokenService } from '../../auth/token.service';
import { SessionService } from '../../auth/session.service';
import type { AuthedRequest } from '../decorators/current-user.decorator';

/**
 * Authenticates a request from its `Authorization: Bearer <access JWT>` header:
 * verifies the RS256 signature, confirms the token kind, checks the backing
 * device session is still active (supporting instant revocation), and attaches
 * the `AuthContext` to the request.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.header('authorization');
    if (header === undefined || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        code: 'MISSING_TOKEN',
        message: 'Missing bearer token.',
      });
    }

    const token = header.slice('Bearer '.length).trim();
    let claims: AccessTokenClaims;
    try {
      claims = await this.tokens.verifyAccessToken(token);
    } catch {
      throw new UnauthorizedException({
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired access token.',
      });
    }

    if (claims.kind !== TokenKind.Access) {
      throw new UnauthorizedException({
        code: 'INVALID_TOKEN',
        message: 'Wrong token kind.',
      });
    }

    if (!(await this.sessions.isActive(claims.sid))) {
      throw new UnauthorizedException({
        code: 'SESSION_REVOKED',
        message: 'Session is no longer active.',
      });
    }

    req.auth = {
      userId: claims.sub,
      sessionId: claims.sid,
      roles: claims.roles,
      isGuest: claims.isGuest,
    };
    return true;
  }
}
