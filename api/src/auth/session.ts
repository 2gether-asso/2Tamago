import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** Identity carried by the session token. */
export interface Session {
  playerId: string;
  isAdmin: boolean;
  /** The auth session of the access token, if it has one. */
  sessionId?: string | undefined;
}

export interface AuthenticatedRequest extends Request {
  session: Session;
}

export const IS_PUBLIC = 'isPublic';
/** Marks a route as reachable without a session. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Requires a session on a route of a `@Public()` controller. */
export const Authenticated = () => SetMetadata(IS_PUBLIC, false);

/** Injects the `Session` of the signed-in player. */
export const CurrentSession = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): Session =>
    ctx.switchToHttp().getRequest<AuthenticatedRequest>().session,
);
