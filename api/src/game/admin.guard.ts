import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/session.js';

/** Restricts a route to admins (`ADMIN_DISCORD_IDS`). Runs after the global `AuthGuard`. */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { session } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!session?.isAdmin) throw new ForbiddenException();
    return true;
  }
}
