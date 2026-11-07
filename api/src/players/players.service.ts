import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import type { ItemId } from '@2tamago/core';
import type { Inventory, PlayerDto } from '@2tamago/core/contracts';
import { and, eq, gt, gte, sql } from 'drizzle-orm';
import { ActivityService } from '../activity/activity.service.js';
import { Clock, dayOf } from '../common/clock.js';
import { AppConfig } from '../config/app-config.js';
import type { Database, Executor } from '../database/database.js';
import { inventory, players, type PlayerRow } from '../database/schema.js';

export const DAILY_BONUS = 20;
/** Max coins earned per day by playing and training. */
export const DAILY_REWARD_CAP = 30;

export class NotEnoughCoinsError extends ConflictException {
  constructor() {
    super({ statusCode: 409, message: 'Pas assez de pièces.', code: 'not_enough_coins' });
  }
}

/** Players, their coins and their inventory. */
@Injectable()
export class PlayersService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly config: AppConfig,
    private readonly clock: Clock,
    private readonly activity: ActivityService,
  ) {}

  async upsertFromLogin(input: {
    discordId: string;
    displayName: string;
    avatarUrl: string | null;
  }): Promise<PlayerRow> {
    const [row] = await this.db
      .insert(players)
      .values(input)
      .onConflictDoUpdate({
        target: players.discordId,
        set: { displayName: input.displayName, avatarUrl: input.avatarUrl, lastSeenAt: new Date() },
      })
      .returning();
    return row!;
  }

  async get(executor: Executor, playerId: string): Promise<PlayerRow> {
    const [row] = await executor.select().from(players).where(eq(players.id, playerId));
    // A valid token for a deleted player.
    if (!row) throw new UnauthorizedException();
    return row;
  }

  async coinsOf(playerId: string): Promise<number> {
    return (await this.get(this.db, playerId)).coins;
  }

  toDto(row: PlayerRow, isAdmin: boolean): PlayerDto {
    return {
      id: row.id,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      coins: row.coins,
      isAdmin,
    };
  }

  /** Gives the daily bonus once per calendar day. Returns the coins given. */
  async claimDailyBonus(playerId: string): Promise<number> {
    const today = this.today();
    return this.db.transaction(async (tx) => {
      const updated = await tx
        .update(players)
        .set({
          coins: sql`${players.coins} + ${DAILY_BONUS}`,
          lastDailyBonusDay: today,
          lastSeenAt: new Date(),
        })
        .where(
          and(
            eq(players.id, playerId),
            sql`${players.lastDailyBonusDay} is distinct from ${today}`,
          ),
        )
        .returning({ id: players.id });
      if (updated.length === 0) return 0;
      await this.activity.record(tx, playerId, 'daily_bonus', { coins: DAILY_BONUS });
      return DAILY_BONUS;
    });
  }

  async addCoins(executor: Executor, playerId: string, amount: number): Promise<number> {
    const [row] = await executor
      .update(players)
      .set({ coins: sql`${players.coins} + ${amount}` })
      .where(eq(players.id, playerId))
      .returning({ coins: players.coins });
    if (!row) throw new NotFoundException();
    return row.coins;
  }

  /** Atomically spends coins, or throws `NotEnoughCoinsError`. */
  async spendCoins(executor: Executor, playerId: string, amount: number): Promise<number> {
    const [row] = await executor
      .update(players)
      .set({ coins: sql`${players.coins} - ${amount}` })
      .where(and(eq(players.id, playerId), gte(players.coins, amount)))
      .returning({ coins: players.coins });
    if (!row) throw new NotEnoughCoinsError();
    return row.coins;
  }

  /** Earns play/training coins, within the daily cap. Returns the coins actually given. */
  async earnCappedReward(executor: Executor, playerId: string, amount: number): Promise<number> {
    const today = this.today();
    const player = await this.get(executor, playerId);
    const earnedToday = player.rewardDay === today ? player.rewardCoins : 0;
    const given = Math.max(0, Math.min(amount, DAILY_REWARD_CAP - earnedToday));
    if (given === 0) return 0;
    await executor
      .update(players)
      .set({
        coins: sql`${players.coins} + ${given}`,
        rewardDay: today,
        rewardCoins: earnedToday + given,
      })
      .where(eq(players.id, playerId));
    return given;
  }

  async inventory(executor: Executor, playerId: string): Promise<Inventory> {
    const rows = await executor
      .select()
      .from(inventory)
      .where(and(eq(inventory.playerId, playerId), gt(inventory.quantity, 0)));
    return Object.fromEntries(rows.map((row) => [row.itemId, row.quantity]));
  }

  async addItem(executor: Executor, playerId: string, itemId: ItemId, quantity = 1): Promise<void> {
    await executor
      .insert(inventory)
      .values({ playerId, itemId, quantity })
      .onConflictDoUpdate({
        target: [inventory.playerId, inventory.itemId],
        set: { quantity: sql`${inventory.quantity} + ${quantity}` },
      });
  }

  async hasItem(executor: Executor, playerId: string, itemId: ItemId): Promise<boolean> {
    const [row] = await executor
      .select({ quantity: inventory.quantity })
      .from(inventory)
      .where(and(eq(inventory.playerId, playerId), eq(inventory.itemId, itemId)));
    return (row?.quantity ?? 0) > 0;
  }

  /** Atomically removes one item. Returns false if the player has none. */
  async takeItem(executor: Executor, playerId: string, itemId: ItemId): Promise<boolean> {
    const updated = await executor
      .update(inventory)
      .set({ quantity: sql`${inventory.quantity} - 1` })
      .where(
        and(
          eq(inventory.playerId, playerId),
          eq(inventory.itemId, itemId),
          gt(inventory.quantity, 0),
        ),
      )
      .returning({ quantity: inventory.quantity });
    return updated.length > 0;
  }

  today(): string {
    return dayOf(this.clock.now(), this.config.game.timezone);
  }
}
