import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import type { ActivityDto, ActivityKind } from '@2tamago/core/contracts';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Database, Executor } from '../database/database.js';
import { activity } from '../database/schema.js';

/**
 * The player's news feed: life events of their pet and what other players did
 * for them. Writers pass their transaction so the entry commits with the action.
 */
@Injectable()
export class ActivityService {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  async record(
    executor: Executor,
    playerId: string,
    kind: ActivityKind,
    data: Record<string, unknown>,
  ): Promise<void> {
    await executor.insert(activity).values({ playerId, kind, data });
  }

  async list(playerId: string, limit = 50): Promise<ActivityDto[]> {
    const rows = await this.db
      .select()
      .from(activity)
      .where(eq(activity.playerId, playerId))
      .orderBy(desc(activity.createdAt))
      .limit(limit);
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      data: row.data,
      createdAt: row.createdAt.getTime(),
      read: row.readAt !== null,
    }));
  }

  async markAllRead(playerId: string): Promise<void> {
    await this.db
      .update(activity)
      .set({ readAt: new Date() })
      .where(and(eq(activity.playerId, playerId), isNull(activity.readAt)));
  }
}
