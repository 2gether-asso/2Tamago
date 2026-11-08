import { ConflictException, Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import type { ClaimResponse, CommunityGoal } from '@2tamago/core/contracts';
import { and, count, eq, gte, isNotNull, isNull, lt } from 'drizzle-orm';
import { ActivityService } from '../activity/activity.service.js';
import { Clock, weekOf, type Week } from '../common/clock.js';
import { AppConfig } from '../config/app-config.js';
import type { Database, Executor } from '../database/database.js';
import { communityClaims, communityGoals, pets, walks } from '../database/schema.js';
import { PlayersService } from '../players/players.service.js';
import { GOAL, targetFor } from './community-goal.js';

/**
 * The weekly community goal: the walks the whole village completes, counted from the `walks`
 * table, with a reward each player takes once the target is reached.
 */
@Injectable()
export class CommunityService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly clock: Clock,
    private readonly config: AppConfig,
    private readonly players: PlayersService,
    private readonly activity: ActivityService,
  ) {}

  private week(): Week {
    return weekOf(this.clock.now(), this.config.game.timezone);
  }

  async current(viewerId: string): Promise<CommunityGoal> {
    const week = this.week();
    const { target } = await this.ensureGoal(this.db, week);
    const progress = await this.walksDone(this.db, week);
    const mine = await this.walksDone(this.db, week, viewerId);
    const claimed = await this.hasClaimed(this.db, week, viewerId);
    const reached = progress >= target;
    return {
      week: week.id,
      endsAt: week.endsAt,
      target,
      progress,
      mine,
      reached,
      reward: GOAL.reward,
      claimed,
      canClaim: reached && mine > 0 && !claimed,
    };
  }

  /**
   * To call after a walk is saved, in its transaction. Returns the target when this walk is the
   * one that reached it (so that it is announced once).
   */
  async walkCompleted(executor: Executor): Promise<number | null> {
    const week = this.week();
    const goal = await this.ensureGoal(executor, week);
    if (goal.reachedAt || (await this.walksDone(executor, week)) < goal.target) return null;
    const updated = await executor
      .update(communityGoals)
      .set({ reachedAt: new Date(this.clock.now()) })
      .where(and(eq(communityGoals.week, week.id), isNull(communityGoals.reachedAt)))
      .returning({ week: communityGoals.week });
    return updated.length > 0 ? goal.target : null;
  }

  async claim(playerId: string): Promise<ClaimResponse> {
    const week = this.week();
    await this.db.transaction(async (tx) => {
      const goal = await this.ensureGoal(tx, week);
      if ((await this.walksDone(tx, week)) < goal.target) {
        throw new ConflictException({ statusCode: 409, code: 'goal_not_reached' });
      }
      if ((await this.walksDone(tx, week, playerId)) === 0) {
        throw new ConflictException({ statusCode: 409, code: 'no_contribution' });
      }
      const inserted = await tx
        .insert(communityClaims)
        .values({ week: week.id, playerId })
        .onConflictDoNothing()
        .returning({ week: communityClaims.week });
      if (inserted.length === 0) {
        throw new ConflictException({ statusCode: 409, code: 'already_claimed' });
      }
      await this.players.addCoins(tx, playerId, GOAL.reward);
      await this.activity.record(tx, playerId, 'community_reward', { coins: GOAL.reward });
    });
    return { coins: await this.players.coinsOf(playerId), reward: GOAL.reward };
  }

  /** The week's goal, created with its target on first use. */
  private async ensureGoal(executor: Executor, week: Week) {
    const [alive] = await executor
      .select({ n: count() })
      .from(pets)
      .where(eq(pets.status, 'alive'));
    await executor
      .insert(communityGoals)
      .values({ week: week.id, target: targetFor(alive?.n ?? 0) })
      .onConflictDoNothing();
    const [goal] = await executor
      .select()
      .from(communityGoals)
      .where(eq(communityGoals.week, week.id));
    return goal!;
  }

  /** Walks finished during the week, by the whole village or by one player. */
  private async walksDone(executor: Executor, week: Week, playerId?: string): Promise<number> {
    const inWeek = and(
      isNotNull(walks.returnedAt),
      gte(walks.returnedAt, new Date(week.startsAt)),
      lt(walks.returnedAt, new Date(week.endsAt)),
    );
    const query = executor.select({ n: count() }).from(walks);
    const [row] = playerId
      ? await query
          .innerJoin(pets, eq(pets.id, walks.petId))
          .where(and(inWeek, eq(pets.ownerId, playerId)))
      : await query.where(inWeek);
    return row?.n ?? 0;
  }

  private async hasClaimed(executor: Executor, week: Week, playerId: string): Promise<boolean> {
    const [row] = await executor
      .select({ week: communityClaims.week })
      .from(communityClaims)
      .where(and(eq(communityClaims.week, week.id), eq(communityClaims.playerId, playerId)));
    return row !== undefined;
  }
}
