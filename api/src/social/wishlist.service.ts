import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { TRADE_LIMITS } from '@2tamago/core';
import type { WishAskBody, WishlistDto } from '@2tamago/core/contracts';
import { and, eq, lt, sql } from 'drizzle-orm';
import { ActivityService } from '../activity/activity.service.js';
import { Clock } from '../common/clock.js';
import type { Database } from '../database/database.js';
import { players, wishAsks, wishlist } from '../database/schema.js';
import { PlayersService } from '../players/players.service.js';
import { WISH_ASK } from './trade.js';

/** What a player would like to get, and the "could you part with this?" asks that follow. */
@Injectable()
export class WishlistService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly clock: Clock,
    private readonly players: PlayersService,
    private readonly activity: ActivityService,
  ) {}

  async get(playerId: string): Promise<WishlistDto> {
    const rows = await this.db
      .select({ item: wishlist.itemId })
      .from(wishlist)
      .where(eq(wishlist.playerId, playerId))
      .orderBy(wishlist.createdAt, wishlist.itemId);
    return { items: rows.map((row) => row.item), max: TRADE_LIMITS.maxWishlist };
  }

  /** Replaces the list (the schema already bounds its size). */
  async replace(playerId: string, items: WishlistDto['items']): Promise<WishlistDto> {
    const unique = [...new Set(items)];
    await this.db.transaction(async (tx) => {
      await tx.delete(wishlist).where(eq(wishlist.playerId, playerId));
      if (unique.length > 0) {
        await tx.insert(wishlist).values(unique.map((itemId) => ({ playerId, itemId })));
      }
    });
    return this.get(playerId);
  }

  /**
   * Tells a member that someone would like one of their items. Only an item the member owns,
   * from the asker's own wishlist, once a day per item and member: it is a nudge, not a chat.
   */
  async ask(askerId: string, body: WishAskBody): Promise<void> {
    if (askerId === body.targetId) {
      throw new BadRequestException({ statusCode: 400, code: 'own_profile' });
    }
    const [target] = await this.db.select().from(players).where(eq(players.id, body.targetId));
    if (!target) throw new NotFoundException({ statusCode: 404, code: 'no_player' });
    const [wished] = await this.db
      .select()
      .from(wishlist)
      .where(and(eq(wishlist.playerId, askerId), eq(wishlist.itemId, body.item)));
    if (!wished) throw new ConflictException({ statusCode: 409, code: 'missing_item' });
    const asker = await this.players.get(this.db, askerId);

    await this.db.transaction(async (tx) => {
      if (!(await this.players.hasItem(tx, body.targetId, body.item))) {
        throw new ConflictException({ statusCode: 409, code: 'missing_item' });
      }
      const now = new Date(this.clock.now());
      const before = new Date(now.getTime() - WISH_ASK.cooldownHours * 3_600_000);
      // One statement: inserts the first ask, or renews one older than the cooldown.
      const claimed = await tx
        .insert(wishAsks)
        .values({ askerId, targetId: body.targetId, itemId: body.item, askedAt: now })
        .onConflictDoUpdate({
          target: [wishAsks.askerId, wishAsks.targetId, wishAsks.itemId],
          set: { askedAt: now },
          setWhere: lt(wishAsks.askedAt, before),
        })
        .returning({ askedAt: sql`${wishAsks.askedAt}` });
      if (claimed.length === 0) {
        throw new ConflictException({ statusCode: 409, code: 'wish_already_asked' });
      }
      await this.activity.record(tx, body.targetId, 'wish_request', {
        playerName: asker.displayName,
        item: body.item,
      });
    });
  }
}
