import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { bundleEntries } from '@2tamago/core';
import type { GiftCodeBody, GiftCodeDto, RedeemResponse } from '@2tamago/core/contracts';
import { and, desc, eq, isNull, lt, sql } from 'drizzle-orm';
import { Clock } from '../common/clock.js';
import type { Database } from '../database/database.js';
import { giftCodeRedemptions, giftCodes } from '../database/schema.js';
import { PlayersService } from '../players/players.service.js';

const conflict = (code: string) => new ConflictException({ statusCode: 409, code });

/** Gift codes: made by admins, entered by players, once each. */
@Injectable()
export class CodesService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly clock: Clock,
    private readonly players: PlayersService,
  ) {}

  async list(): Promise<GiftCodeDto[]> {
    const rows = await this.db
      .select()
      .from(giftCodes)
      .orderBy(desc(giftCodes.createdAt))
      .limit(100);
    return rows.map(toDto);
  }

  async create(adminId: string, body: GiftCodeBody): Promise<GiftCodeDto> {
    const inserted = await this.db
      .insert(giftCodes)
      .values({
        code: body.code,
        coins: body.coins,
        items: body.items,
        maxUses: body.maxUses,
        expiresAt: body.expiresAt === null ? null : new Date(body.expiresAt),
        createdBy: adminId,
      })
      .onConflictDoNothing()
      .returning();
    if (inserted.length === 0) throw conflict('code_exists');
    return toDto(inserted[0]!);
  }

  /** Switches a code off: it stops working, and stays in the list for the record. */
  async disable(id: string): Promise<void> {
    const updated = await this.db
      .update(giftCodes)
      .set({ disabledAt: new Date(this.clock.now()) })
      .where(and(eq(giftCodes.id, id), isNull(giftCodes.disabledAt)))
      .returning({ id: giftCodes.id });
    if (updated.length === 0) throw new NotFoundException({ statusCode: 404, code: 'no_code' });
  }

  async redeem(playerId: string, entered: string): Promise<RedeemResponse> {
    const code = entered.trim().toUpperCase();
    const now = new Date(this.clock.now());
    return this.db.transaction(async (tx) => {
      const [gift] = await tx.select().from(giftCodes).where(eq(giftCodes.code, code));
      // A switched-off code is as good as unknown: there is no point in telling it is real.
      if (!gift || gift.disabledAt)
        throw new NotFoundException({ statusCode: 404, code: 'no_code' });
      if (gift.expiresAt && gift.expiresAt <= now) throw conflict('code_expired');

      const first = await tx
        .insert(giftCodeRedemptions)
        .values({ codeId: gift.id, playerId })
        .onConflictDoNothing()
        .returning({ codeId: giftCodeRedemptions.codeId });
      if (first.length === 0) throw conflict('code_already_redeemed');
      // Claimed in one statement: of two players using the last use, one gets it.
      const claimed = await tx
        .update(giftCodes)
        .set({ uses: sql`${giftCodes.uses} + 1` })
        .where(and(eq(giftCodes.id, gift.id), lt(giftCodes.uses, giftCodes.maxUses)))
        .returning({ id: giftCodes.id });
      if (claimed.length === 0) throw conflict('code_used_up');

      let balance = (await this.players.get(tx, playerId)).coins;
      if (gift.coins > 0) balance = await this.players.addCoins(tx, playerId, gift.coins);
      for (const [item, quantity] of bundleEntries(gift.items)) {
        await this.players.addItem(tx, playerId, item, quantity);
      }
      return {
        coins: gift.coins,
        items: gift.items,
        balance,
        inventory: await this.players.inventory(tx, playerId),
      };
    });
  }
}

function toDto(row: typeof giftCodes.$inferSelect): GiftCodeDto {
  return {
    id: row.id,
    code: row.code,
    coins: row.coins,
    items: row.items,
    maxUses: row.maxUses,
    uses: row.uses,
    expiresAt: row.expiresAt?.getTime() ?? null,
    disabled: row.disabledAt !== null,
    createdAt: row.createdAt.getTime(),
  };
}
