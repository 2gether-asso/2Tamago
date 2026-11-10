import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import type { AccountOverview } from '@2tamago/core/contracts';
import { eq } from 'drizzle-orm';
import { AuthSessionService } from '../auth/auth-session.service.js';
import type { Database } from '../database/database.js';
import { players } from '../database/schema.js';
import { NameFilterService } from '../moderation/name-filter.service.js';
import { PlayersService } from '../players/players.service.js';
import { TradesService } from '../social/trades.service.js';

@Injectable()
export class AccountService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly players: PlayersService,
    private readonly sessions: AuthSessionService,
    private readonly names: NameFilterService,
    private readonly trades: TradesService,
  ) {}

  async get(playerId: string, currentSessionId: string | undefined): Promise<AccountOverview> {
    const player = await this.players.get(this.db, playerId);
    const rows = await this.sessions.listFor(playerId);
    return {
      displayName: player.displayName,
      nameLocked: player.nameByAdmin,
      memberSince: player.createdAt.getTime(),
      sessions: rows.map((row) => ({
        id: row.id,
        current: row.id === currentSessionId,
        createdAt: row.createdAt.getTime(),
        lastUsedAt: row.lastUsedAt.getTime(),
        expiresAt: Math.min(row.idleExpiresAt.getTime(), row.absoluteExpiresAt.getTime()),
        ip: row.lastIp,
        family: row.clientFamily,
      })),
    };
  }

  /**
   * The player picks their own name. It sticks (Discord no longer replaces it at sign-in), unless
   * an admin set it: then only an admin can change it.
   */
  async rename(playerId: string, name: string): Promise<void> {
    const player = await this.players.get(this.db, playerId);
    if (player.nameByAdmin) throw new ConflictException({ statusCode: 409, code: 'name_locked' });
    await this.names.assertAllowed(name);
    await this.db
      .update(players)
      .set({ displayName: name, nameLocked: true })
      .where(eq(players.id, playerId));
  }

  /**
   * Erases the account: the player must type their displayed name. Everything they own goes with
   * the `players` row (companions, items, sessions, history); what other players had set aside for
   * them is given back first. Signing in with Discord again starts a new account.
   */
  async delete(playerId: string, confirm: string): Promise<void> {
    const player = await this.players.get(this.db, playerId);
    if (confirm.trim() !== player.displayName) {
      throw new ConflictException({ statusCode: 409, code: 'confirmation_mismatch' });
    }
    await this.db.transaction(async (tx) => {
      await this.trades.declineAllTo(tx, playerId);
      await tx.delete(players).where(eq(players.id, playerId));
    });
  }

  async revoke(playerId: string, sessionId: string): Promise<void> {
    if (!(await this.sessions.revokeOf(playerId, sessionId))) {
      throw new NotFoundException({ statusCode: 404, code: 'no_session' });
    }
  }

  async revokeOthers(playerId: string, currentSessionId: string | undefined): Promise<void> {
    await this.sessions.revokeOthers(playerId, currentSessionId);
  }
}
