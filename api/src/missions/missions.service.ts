import { ConflictException, Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import {
  allMissionsDone,
  countMission,
  MISSION_REWARD,
  MISSIONS,
  missionPresent,
  pickMissions,
  type MissionSignal,
  type Stage,
} from '@2tamago/core';
import type { DailyMissionsDto, MissionsClaimResponse, Notice } from '@2tamago/core/contracts';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Database, Executor } from '../database/database.js';
import { dailyMissions, pets } from '../database/schema.js';
import { PlayersService } from '../players/players.service.js';

type MissionsRow = typeof dailyMissions.$inferSelect;

/**
 * The daily missions of each player: picked by the engine at the first look of the day, counted
 * as the player plays (other services call `record()` inside their own transaction), paid as
 * each one is done, and a present to open once all three are.
 */
@Injectable()
export class MissionsService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly players: PlayersService,
  ) {}

  async today(playerId: string): Promise<DailyMissionsDto> {
    return toDto(await this.ensure(this.db, playerId, false));
  }

  /**
   * Counts something the player did towards today's missions, inside the caller's transaction.
   * Pays the missions it completes and returns what to tell the player.
   */
  async record(
    tx: Executor,
    playerId: string,
    signal: MissionSignal,
    amount = 1,
  ): Promise<Notice[]> {
    const row = await this.ensure(tx, playerId, true);
    const { missions, completed } = countMission(row.missions, signal, amount);
    if (missions.every((m, i) => m.progress === row.missions[i]!.progress)) return [];
    await tx
      .update(dailyMissions)
      .set({ missions })
      .where(and(eq(dailyMissions.playerId, playerId), eq(dailyMissions.day, row.day)));
    if (completed.length === 0) return [];
    const coins = completed.length * MISSION_REWARD.coins;
    await this.players.addCoins(tx, playerId, coins);
    return [
      ...completed.map((mission): Notice => ({ code: 'mission_done', mission })),
      { code: 'coins_earned', count: coins },
    ];
  }

  /** Opens the present of the day, once all the missions are done. */
  async claim(playerId: string): Promise<MissionsClaimResponse> {
    const item = missionPresent(Math.random());
    const missions = await this.db.transaction(async (tx) => {
      const row = await this.ensure(tx, playerId, true);
      if (!allMissionsDone(row.missions)) {
        throw new ConflictException({ statusCode: 409, code: 'missions_not_done' });
      }
      // Taken in one statement: two requests at once open one present.
      const [claimed] = await tx
        .update(dailyMissions)
        .set({ claimedAt: new Date() })
        .where(
          and(
            eq(dailyMissions.playerId, playerId),
            eq(dailyMissions.day, row.day),
            isNull(dailyMissions.claimedAt),
          ),
        )
        .returning();
      if (!claimed) throw new ConflictException({ statusCode: 409, code: 'already_opened' });
      await this.players.addItem(tx, playerId, item);
      await this.players.addCoins(tx, playerId, MISSION_REWARD.bonusCoins);
      return toDto(claimed);
    });
    return {
      missions,
      item,
      bonusCoins: MISSION_REWARD.bonusCoins,
      coins: await this.players.coinsOf(playerId),
    };
  }

  /** Today's row, created with the day's missions on the first look. */
  private async ensure(executor: Executor, playerId: string, lock: boolean): Promise<MissionsRow> {
    const day = this.players.today();
    const find = async () => {
      const query = executor
        .select()
        .from(dailyMissions)
        .where(and(eq(dailyMissions.playerId, playerId), eq(dailyMissions.day, day)));
      const [row] = lock ? await query.for('update') : await query;
      return row;
    };
    const found = await find();
    if (found) return found;
    const [pet] = await executor
      .select({ state: pets.state })
      .from(pets)
      .where(eq(pets.ownerId, playerId))
      .orderBy(desc(pets.createdAt))
      .limit(1);
    const stage: Stage = pet?.state.status === 'alive' ? pet.state.stage : 'baby';
    const missions = pickMissions(`${playerId}:${day}`, stage).map((id) => ({ id, progress: 0 }));
    await executor.insert(dailyMissions).values({ playerId, day, missions }).onConflictDoNothing();
    return (await find())!;
  }
}

function toDto(row: MissionsRow): DailyMissionsDto {
  const missions = row.missions
    .filter((m) => m.id in MISSIONS)
    .map((m) => ({ id: m.id, progress: m.progress, target: MISSIONS[m.id].target }));
  return {
    day: row.day,
    missions,
    allDone: allMissionsDone(row.missions),
    claimed: row.claimedAt !== null,
  };
}
