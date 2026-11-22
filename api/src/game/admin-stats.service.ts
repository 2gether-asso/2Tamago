import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { simulate } from '@2tamago/core';
import type { AdminBalance, AdminStats } from '@2tamago/core/contracts';
import { and, count, eq, gte, inArray, sql } from 'drizzle-orm';
import { Clock, dayOf } from '../common/clock.js';
import { AppConfig } from '../config/app-config.js';
import type { Database } from '../database/database.js';
import {
  activity,
  dailyMissions,
  encounters,
  interactions,
  inventory,
  pets,
  players,
  walks,
} from '../database/schema.js';
import { BALANCE_WINDOW_DAYS, buildBalanceReport, type BalanceEvent } from './admin-balance.js';
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

  /**
   * The balance overview: the pets, and what the activity feed kept of the last days (illnesses,
   * care mistakes, granted wishes, daily logins) with the daily missions.
   */
  async balance(): Promise<AdminBalance> {
    const now = this.clock.now();
    const rules = this.gameRules.current;
    // A day of margin: the window is cut on the pet events' own times below.
    const since = new Date(now - (BALANCE_WINDOW_DAYS + 1) * 86_400_000);
    const KINDS = { fell_ill: 'illness', care_mistake: 'mistake', wish_granted: 'wish' } as const;

    const [petRows, eventRows, loginRows, missionRows] = await Promise.all([
      this.db.select({ state: pets.state }).from(pets),
      this.db
        .select({ createdAt: activity.createdAt, data: activity.data })
        .from(activity)
        .where(
          and(
            eq(activity.kind, 'pet_event'),
            gte(activity.createdAt, since),
            inArray(sql<string>`${activity.data}->>'event'`, Object.keys(KINDS)),
          ),
        ),
      this.db
        .select({ playerId: activity.playerId, createdAt: activity.createdAt, data: activity.data })
        .from(activity)
        .where(and(eq(activity.kind, 'daily_bonus'), gte(activity.createdAt, since))),
      this.db
        .select({ day: dailyMissions.day, missions: dailyMissions.missions })
        .from(dailyMissions)
        .where(gte(dailyMissions.createdAt, since)),
    ]);

    const events = eventRows.flatMap(({ createdAt, data }): BalanceEvent[] => {
      const kind = KINDS[data.event as keyof typeof KINDS];
      // Dated when it happened in the game, not when a later visit wrote it down.
      const at = typeof data.at === 'number' ? data.at : createdAt.getTime();
      const text = (key: string) => (typeof data[key] === 'string' ? (data[key] as string) : null);
      if (kind === 'illness') return [{ at, kind, illness: text('illness') }];
      if (kind === 'mistake') return [{ at, kind, need: text('need') }];
      if (kind === 'wish') return [{ at, kind, wish: text('wish') }];
      return [];
    });

    return buildBalanceReport({
      now,
      rules,
      timezone: this.config.game.timezone,
      pets: petRows.map(({ state }) =>
        state.status === 'alive' ? simulate(state, now, rules).state : state,
      ),
      events,
      logins: loginRows.map((row) => ({
        playerId: row.playerId,
        // Rows written before the day was recorded fall back on their time.
        day:
          typeof row.data.day === 'string'
            ? row.data.day
            : dayOf(row.createdAt.getTime(), this.config.game.timezone),
      })),
      missions: missionRows,
    });
  }
}
