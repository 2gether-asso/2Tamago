import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { simulate } from '@2tamago/core';
import type { AdminStats } from '@2tamago/core/contracts';
import { count, gte, sql } from 'drizzle-orm';
import { Clock } from '../common/clock.js';
import { AppConfig } from '../config/app-config.js';
import type { Database } from '../database/database.js';
import { encounters, interactions, inventory, pets, players, walks } from '../database/schema.js';
import { buildAdminStats } from './admin-stats.js';
import { GameRulesService } from './game-rules.service.js';

/** Window of the daily activity series, with a margin for time zones. */
const SERIES_WINDOW_MS = 16 * 86_400_000;

/**
 * Reads the whole game and hands it to `buildAdminStats`. It loads every companion, which is fine
 * for a community of a few hundred players; past that, move the sums into SQL.
 */
@Injectable()
export class AdminStatsService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly gameRules: GameRulesService,
    private readonly clock: Clock,
    private readonly config: AppConfig,
  ) {}

  async get(): Promise<AdminStats> {
    const now = this.clock.now();
    const rules = this.gameRules.current;
    const since = new Date(now - SERIES_WINDOW_MS);

    const [playerRows, petRows, inventoryRows, interactionRows, walkRows, encounterRows] =
      await Promise.all([
        this.db
          .select({
            createdAt: players.createdAt,
            lastSeenAt: players.lastSeenAt,
            coins: players.coins,
          })
          .from(players),
        this.db.select({ state: pets.state }).from(pets),
        this.db
          .select({
            itemId: inventory.itemId,
            quantity: sql<number>`sum(${inventory.quantity})::int`,
          })
          .from(inventory)
          .groupBy(inventory.itemId),
        this.db
          .select({ createdAt: interactions.createdAt, kind: interactions.kind })
          .from(interactions)
          .where(gte(interactions.createdAt, since)),
        this.db
          .select({ startedAt: walks.startedAt })
          .from(walks)
          .where(gte(walks.startedAt, since)),
        this.db.select({ n: count() }).from(encounters),
      ]);

    return buildAdminStats({
      now,
      rules,
      timezone: this.config.game.timezone,
      players: playerRows.map((row) => ({
        createdAt: row.createdAt.getTime(),
        lastSeenAt: row.lastSeenAt.getTime(),
        coins: row.coins,
      })),
      // The stored state is as old as the last write: bring the living ones up to date.
      pets: petRows.map(({ state }) =>
        state.status === 'alive' ? simulate(state, now, rules).state : state,
      ),
      inventory: inventoryRows,
      interactions: interactionRows.map((row) => ({
        createdAt: row.createdAt.getTime(),
        kind: row.kind,
      })),
      walks: walkRows.map((row) => ({ startedAt: row.startedAt.getTime() })),
      encounters: encounterRows[0]?.n ?? 0,
    });
  }
}
