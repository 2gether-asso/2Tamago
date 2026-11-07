import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export const SESSION_COOKIE = 'tamago_session';
export const OAUTH_STATE_COOKIE = 'tamago_oauth_state';

/** Identity carried by the session token. */
export interface Session {
  playerId: string;
  isAdmin: boolean;
}

export interface AuthenticatedRequest extends Request {
  session: Session;
}

export const IS_PUBLIC = 'isPublic';
/** Marks a route as reachable without a session. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Injects the `Session` of the signed-in player. */
export const CurrentSession = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): Session =>
    ctx.switchToHttp().getRequest<AuthenticatedRequest>().session,
);

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }
  return undefined;
}
