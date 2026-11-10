import { Body, ConflictException, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { isForSale, isUnique, ITEMS } from '@2tamago/core';
import { buyBody, type BuyBody, type Inventory } from '@2tamago/core/contracts';
import { CurrentSession, type Session } from '../auth/session.js';
import type { Database, Executor } from '../database/database.js';
import { EventsService } from '../events/events.service.js';
import { PlayersService } from '../players/players.service.js';

@Controller('shop')
export class ShopController {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    @Inject(PlayersService) private readonly players: PlayersService,
    private readonly events: EventsService,
  ) {}

  @Post('buy')
  @HttpCode(200)
  async buy(
    @CurrentSession() session: Session,
    @Body({ schema: buyBody }) body: BuyBody,
  ): Promise<{ coins: number; inventory: Inventory }> {
    // Some items can only be found on walks.
    if (!isForSale(body.item)) {
      throw new ConflictException({ statusCode: 409, code: 'not_for_sale' });
    }
    // An accessory or a decoration is kept once: no second one, not even in a bundle.
    const ensureNotOwned = async (executor: Executor) => {
      if (
        isUnique(body.item) &&
        (body.quantity > 1 || (await this.players.hasItem(executor, session.playerId, body.item)))
      ) {
        throw new ConflictException({ statusCode: 409, code: 'already_owned' });
      }
    };
    // Said before the price: someone short of coins still learns they own it.
    await ensureNotOwned(this.db);
    // The discount of an event applies to each item, then to the quantity.
    const price = (await this.events.price(ITEMS[body.item].price)) * body.quantity;
    return this.db.transaction(async (tx) => {
      const coins = await this.players.spendCoins(tx, session.playerId, price);
      // Again, now that the coins update holds the player's row: two simultaneous purchases
      // cannot both pass (the loser rolls back, coins included).
      await ensureNotOwned(tx);
      await this.players.addItem(tx, session.playerId, body.item, body.quantity);
      return { coins, inventory: await this.players.inventory(tx, session.playerId) };
    });
  }
}
