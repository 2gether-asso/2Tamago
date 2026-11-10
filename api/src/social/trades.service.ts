import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { bundleEntries, isUnique, type Bundle } from '@2tamago/core';
import type {
  TradeBody,
  TradeDto,
  TradeOverview,
  TradeResult,
  TradeTarget,
} from '@2tamago/core/contracts';
import { aliasedTable, and, count, eq, lte, or, type SQL } from 'drizzle-orm';
import { ActivityService } from '../activity/activity.service.js';
import { Clock } from '../common/clock.js';
import type { Database, Transaction } from '../database/database.js';
import { players, trades, wishlist } from '../database/schema.js';
import { NotEnoughCoinsError, PlayersService } from '../players/players.service.js';
import { PushService } from '../push/push.service.js';
import { TRADE } from './trade.js';

const noTrade = () => new NotFoundException({ statusCode: 404, code: 'no_trade' });
const missingItem = () => new ConflictException({ statusCode: 409, code: 'missing_item' });
const invalidTrade = () => new ConflictException({ statusCode: 409, code: 'trade_invalid' });

type Closing = 'accepted' | 'declined' | 'cancelled' | 'expired';

/**
 * Item trades between players. Making an offer sets the offered items aside; accepting swaps
 * both sides in one transaction, so that nobody ever ends up with both or neither; declining,
 * cancelling and lapsing give the items back. Each change of state is claimed with a single
 * `UPDATE … WHERE status = 'pending'`: whoever gets the row first decides, whatever the timing.
 */
@Injectable()
export class TradesService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly clock: Clock,
    private readonly players: PlayersService,
    private readonly activity: ActivityService,
    private readonly push: PushService,
  ) {}

  async overview(viewerId: string): Promise<TradeOverview> {
    await this.expireStale();
    const mine = await this.dtos(
      or(eq(trades.proposerId, viewerId), eq(trades.targetId, viewerId))!,
    );
    return {
      expireHours: TRADE.expireHours,
      maxOpen: TRADE.maxOpen,
      incoming: mine.filter((trade) => trade.targetId === viewerId),
      outgoing: mine.filter((trade) => trade.proposerId === viewerId),
    };
  }

  /** What a member owns and wishes for: the offer form only lets one ask for what is there. */
  async target(targetId: string): Promise<TradeTarget> {
    const [target] = await this.db.select().from(players).where(eq(players.id, targetId));
    if (!target) throw new NotFoundException({ statusCode: 404, code: 'no_player' });
    const rows = await this.db
      .select({ item: wishlist.itemId })
      .from(wishlist)
      .where(eq(wishlist.playerId, targetId));
    return {
      inventory: await this.players.inventory(this.db, targetId),
      wishlist: rows.map((row) => row.item),
    };
  }

  async offer(proposerId: string, body: TradeBody): Promise<TradeDto> {
    await this.expireStale();
    if (proposerId === body.targetId) {
      throw new BadRequestException({ statusCode: 400, code: 'own_profile' });
    }
    const [target] = await this.db.select().from(players).where(eq(players.id, body.targetId));
    if (!target) throw new NotFoundException({ statusCode: 404, code: 'no_player' });
    const proposer = await this.players.get(this.db, proposerId);

    const id = await this.db.transaction(async (tx) => {
      const [open] = await tx
        .select({ n: count() })
        .from(trades)
        .where(and(eq(trades.proposerId, proposerId), eq(trades.status, 'pending')));
      if ((open?.n ?? 0) >= TRADE.maxOpen) {
        throw new ConflictException({ statusCode: 409, code: 'trade_full' });
      }
      // An accessory or a decoration is kept once: it makes no sense to give one to, or ask one from, an owner.
      if (
        (await this.ownsUnique(tx, body.targetId, body.offer)) ||
        (await this.ownsUnique(tx, proposerId, body.request))
      ) {
        throw invalidTrade();
      }
      // Only what the target owns can be asked for, and the coins asked must exist.
      const theirs = await this.players.inventory(tx, body.targetId);
      for (const [item, quantity] of bundleEntries(body.request)) {
        if ((theirs[item] ?? 0) < quantity) throw missingItem();
      }
      if (body.requestCoins > 0 && target.coins < body.requestCoins) {
        throw new NotEnoughCoinsError();
      }
      await this.take(tx, proposerId, body.offer);
      if (body.offerCoins > 0) await this.players.spendCoins(tx, proposerId, body.offerCoins);
      const [row] = await tx
        .insert(trades)
        .values({
          proposerId,
          targetId: body.targetId,
          offer: body.offer,
          request: body.request,
          offerCoins: body.offerCoins,
          requestCoins: body.requestCoins,
          status: 'pending',
          expiresAt: new Date(this.clock.now() + TRADE.expireHours * 3_600_000),
        })
        .returning({ id: trades.id });
      await this.activity.record(tx, body.targetId, 'trade_offer', {
        playerName: proposer.displayName,
      });
      return row!.id;
    });
    // Only a nudge, once the offer is saved: it may fail without harm (it is in their journal).
    void this.push.notify(body.targetId, 'trade_offer', '', proposer.displayName).catch(() => {});
    return (await this.dtos(eq(trades.id, id)))[0]!;
  }

  /** The target takes the offer: both sides change hands together, or nothing does. */
  async accept(targetId: string, id: string): Promise<TradeResult> {
    await this.expireStale();
    const target = await this.players.get(this.db, targetId);
    await this.db.transaction(async (tx) => {
      const trade = await this.claim(
        tx,
        and(eq(trades.id, id), eq(trades.targetId, targetId))!,
        'accepted',
      );
      if (!trade) throw noTrade();
      if (
        (await this.ownsUnique(tx, targetId, trade.offer)) ||
        (await this.ownsUnique(tx, trade.proposerId, trade.request))
      ) {
        throw invalidTrade();
      }
      // A shortage rolls back everything above, the claim included: the offer stays open.
      await this.take(tx, targetId, trade.request);
      if (trade.requestCoins > 0) await this.players.spendCoins(tx, targetId, trade.requestCoins);
      await this.give(tx, targetId, trade.offer);
      await this.give(tx, trade.proposerId, trade.request);
      if (trade.requestCoins > 0) {
        await this.players.addCoins(tx, trade.proposerId, trade.requestCoins);
      }
      if (trade.offerCoins > 0) await this.players.addCoins(tx, targetId, trade.offerCoins);
      await this.activity.record(tx, trade.proposerId, 'trade_accepted', {
        playerName: target.displayName,
      });
    });
    return {
      coins: await this.players.coinsOf(targetId),
      inventory: await this.players.inventory(this.db, targetId),
    };
  }

  async decline(targetId: string, id: string): Promise<void> {
    await this.expireStale();
    const target = await this.players.get(this.db, targetId);
    await this.db.transaction(async (tx) => {
      const trade = await this.claim(
        tx,
        and(eq(trades.id, id), eq(trades.targetId, targetId))!,
        'declined',
      );
      if (!trade) throw noTrade();
      await this.refund(tx, trade);
      await this.activity.record(tx, trade.proposerId, 'trade_declined', {
        playerName: target.displayName,
      });
    });
  }

  /** The proposer withdraws the offer and gets their items back. */
  async cancel(proposerId: string, id: string): Promise<void> {
    await this.expireStale();
    await this.db.transaction(async (tx) => {
      const trade = await this.claim(
        tx,
        and(eq(trades.id, id), eq(trades.proposerId, proposerId))!,
        'cancelled',
      );
      if (!trade) throw noTrade();
      await this.refund(tx, trade);
    });
  }

  /**
   * A player is leaving for good: the offers made to them are declined and the proposers get
   * their items back (the offers they made themselves go away with them, nothing was taken from
   * anybody else).
   */
  async declineAllTo(tx: Transaction, targetId: string): Promise<void> {
    const target = await this.players.get(tx, targetId);
    const pending = await tx
      .select({ id: trades.id })
      .from(trades)
      .where(and(eq(trades.targetId, targetId), eq(trades.status, 'pending')));
    for (const { id } of pending) {
      const trade = await this.claim(tx, eq(trades.id, id), 'declined');
      if (!trade) continue;
      await this.refund(tx, trade);
      await this.activity.record(tx, trade.proposerId, 'trade_declined', {
        playerName: target.displayName,
      });
    }
  }

  /** Gives back what was set aside for the offers nobody answered in time. */
  private async expireStale(): Promise<void> {
    const now = new Date(this.clock.now());
    const stale = await this.db
      .select({ id: trades.id })
      .from(trades)
      .where(and(eq(trades.status, 'pending'), lte(trades.expiresAt, now)));
    for (const { id } of stale) {
      await this.db.transaction(async (tx) => {
        const trade = await this.claim(tx, eq(trades.id, id), 'expired');
        if (!trade) return; // answered, or expired by someone else, in the meantime
        const [target] = await tx.select().from(players).where(eq(players.id, trade.targetId));
        await this.refund(tx, trade);
        await this.activity.record(tx, trade.proposerId, 'trade_expired', {
          playerName: target?.displayName ?? '',
        });
      });
    }
  }

  /** Moves a pending trade to its end state, once: `undefined` if it was not pending (any more). */
  private async claim(tx: Transaction, where: SQL, status: Closing) {
    const [trade] = await tx
      .update(trades)
      .set({ status, resolvedAt: new Date(this.clock.now()) })
      .where(and(where, eq(trades.status, 'pending')))
      .returning();
    return trade;
  }

  /** Gives the proposer back what was set aside: items and coins. */
  private async refund(
    tx: Transaction,
    trade: { proposerId: string; offer: Bundle; offerCoins: number },
  ): Promise<void> {
    await this.give(tx, trade.proposerId, trade.offer);
    if (trade.offerCoins > 0) await this.players.addCoins(tx, trade.proposerId, trade.offerCoins);
  }

  private async take(tx: Transaction, playerId: string, bundle: Bundle): Promise<void> {
    for (const [item, quantity] of bundleEntries(bundle)) {
      if (!(await this.players.takeItems(tx, playerId, item, quantity))) throw missingItem();
    }
  }

  private async give(tx: Transaction, playerId: string, bundle: Bundle): Promise<void> {
    for (const [item, quantity] of bundleEntries(bundle)) {
      await this.players.addItem(tx, playerId, item, quantity);
    }
  }

  private async ownsUnique(tx: Transaction, playerId: string, bundle: Bundle): Promise<boolean> {
    for (const [item] of bundleEntries(bundle)) {
      if (isUnique(item) && (await this.players.hasItem(tx, playerId, item))) return true;
    }
    return false;
  }

  private async dtos(where: SQL): Promise<TradeDto[]> {
    const proposer = aliasedTable(players, 'proposer');
    const target = aliasedTable(players, 'target');
    const rows = await this.db
      .select({ trade: trades, proposerName: proposer.displayName, targetName: target.displayName })
      .from(trades)
      .innerJoin(proposer, eq(proposer.id, trades.proposerId))
      .innerJoin(target, eq(target.id, trades.targetId))
      .where(and(eq(trades.status, 'pending'), where));
    return rows
      .map(({ trade, proposerName, targetName }) => ({
        id: trade.id,
        proposerId: trade.proposerId,
        proposerName,
        targetId: trade.targetId,
        targetName,
        offer: trade.offer,
        request: trade.request,
        offerCoins: trade.offerCoins,
        requestCoins: trade.requestCoins,
        expiresAt: trade.expiresAt.getTime(),
      }))
      .sort((a, b) => a.expiresAt - b.expiresAt);
  }
}
