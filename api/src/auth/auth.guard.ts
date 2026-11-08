import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { AccessClaims } from './auth-session.service.js';
import { IS_PUBLIC, type AuthenticatedRequest, type Session } from './session.js';

/**
 * Global guard: every route needs a valid session unless marked `@Public()`.
 * The access token comes in a bearer header: no cookie is involved, so the web app can live on
 * any site.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token) throw new UnauthorizedException();
    try {
      const payload = await this.jwt.verifyAsync<AccessClaims>(token);
      // Other tokens signed with the same secret (the Discord sign-in state) are not sessions.
      if (payload.typ !== 'access') throw new UnauthorizedException();
      req.session = {
        playerId: payload.sub,
        isAdmin: payload.adm === true,
        sessionId: payload.sid,
      } satisfies Session;
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
