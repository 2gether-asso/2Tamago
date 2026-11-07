import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import {
  IS_PUBLIC,
  SESSION_COOKIE,
  readCookie,
  type AuthenticatedRequest,
  type Session,
} from './session.js';

/**
 * Global guard: every route needs a valid session unless marked `@Public()`.
 * The token comes from the session cookie (web app) or a bearer header
 * (scripts, future mobile app or WebSocket clients).
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
    const bearer = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    const token = bearer ?? readCookie(req, SESSION_COOKIE);
    if (!token) throw new UnauthorizedException();
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; adm?: boolean }>(token);
      req.session = { playerId: payload.sub, isAdmin: payload.adm === true } satisfies Session;
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
