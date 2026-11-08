import { Body, ConflictException, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { isForSale, ITEMS } from '@2tamago/core';
import { buyBody, type BuyBody, type Inventory } from '@2tamago/core/contracts';
import { CurrentSession, type Session } from '../auth/session.js';
import type { Database } from '../database/database.js';
import { PlayersService } from '../players/players.service.js';

@Controller('shop')
export class ShopController {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    @Inject(PlayersService) private readonly players: PlayersService,
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
    const price = ITEMS[body.item].price * body.quantity;
    return this.db.transaction(async (tx) => {
      const coins = await this.players.spendCoins(tx, session.playerId, price);
      await this.players.addItem(tx, session.playerId, body.item, body.quantity);
      return { coins, inventory: await this.players.inventory(tx, session.playerId) };
    });
  }
}
