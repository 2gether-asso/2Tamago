import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { bestPercent, boosted, discounted, type EventKind } from '@2tamago/core';
import type { EventBody, EventsOverview, GameEventDto } from '@2tamago/core/contracts';
import { and, desc, eq, gt, isNull, lte } from 'drizzle-orm';
import { AnnouncementService } from '../announcements/announcement.service.js';
import { Clock } from '../common/clock.js';
import type { Database } from '../database/database.js';
import { gameEvents } from '../database/schema.js';

/** How far ahead members are told about events. */
const UPCOMING_DAYS = 7;

/**
 * Events: bonuses an admin schedules. Whoever pays out coins or sets a price asks here what is
 * on right now. Read `percent()` before a transaction, not inside it: it uses the pool.
 */
@Injectable()
export class EventsService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly clock: Clock,
    private readonly announcements: AnnouncementService,
  ) {}

  async overview(): Promise<EventsOverview> {
    const now = new Date(this.clock.now());
    const horizon = new Date(this.clock.now() + UPCOMING_DAYS * 86_400_000);
    const rows = await this.db
      .select()
      .from(gameEvents)
      .where(
        and(
          isNull(gameEvents.cancelledAt),
          gt(gameEvents.endsAt, now),
          lte(gameEvents.startsAt, horizon),
        ),
      )
      .orderBy(gameEvents.startsAt);
    const events = rows.map(toDto);
    return {
      active: events.filter((event) => event.startsAt <= now.getTime()),
      upcoming: events.filter((event) => event.startsAt > now.getTime()),
    };
  }

  /** The bonus on right now for a kind of event, in percent (0: none). */
  async percent(kind: EventKind): Promise<number> {
    return bestPercent((await this.overview()).active, kind);
  }

  /** Coins with the bonus of the moment. */
  async boost(kind: EventKind, base: number): Promise<number> {
    return boosted(base, await this.percent(kind));
  }

  /** A price with the discount of the moment. */
  async price(base: number): Promise<number> {
    return discounted(base, await this.percent('shop_discount'));
  }

  async list(): Promise<GameEventDto[]> {
    const rows = await this.db
      .select()
      .from(gameEvents)
      .orderBy(desc(gameEvents.startsAt))
      .limit(30);
    return rows.map(toDto);
  }

  async create(adminId: string, body: EventBody): Promise<GameEventDto> {
    const [row] = await this.db
      .insert(gameEvents)
      .values({
        kind: body.kind,
        percent: body.percent,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
        createdBy: adminId,
      })
      .returning();
    this.announcements.event(body.kind, body.percent, body.startsAt, body.endsAt);
    return toDto(row!);
  }

  /** Calls an event off: it stops now (or never starts). */
  async cancel(id: string): Promise<void> {
    const cancelled = await this.db
      .update(gameEvents)
      .set({ cancelledAt: new Date(this.clock.now()) })
      .where(and(eq(gameEvents.id, id), isNull(gameEvents.cancelledAt)))
      .returning({ id: gameEvents.id });
    if (cancelled.length === 0) throw new NotFoundException({ statusCode: 404, code: 'no_event' });
  }
}

function toDto(row: typeof gameEvents.$inferSelect): GameEventDto {
  return {
    id: row.id,
    kind: row.kind,
    percent: row.percent,
    startsAt: row.startsAt.getTime(),
    endsAt: row.endsAt.getTime(),
    cancelled: row.cancelledAt !== null,
  };
}
