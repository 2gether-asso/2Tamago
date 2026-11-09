import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import {
  wishAskBody,
  wishlistBody,
  type WishAskBody,
  type WishlistBody,
} from '@2tamago/core/contracts';
import { CurrentSession, type Session } from '../auth/session.js';
import { WishlistService } from './wishlist.service.js';

@Controller('wishlist')
export class WishlistController {
  constructor(private readonly wishlist: WishlistService) {}

  @Get()
  get(@CurrentSession() session: Session) {
    return this.wishlist.get(session.playerId);
  }

  @Put()
  replace(@CurrentSession() session: Session, @Body({ schema: wishlistBody }) body: WishlistBody) {
    return this.wishlist.replace(session.playerId, body.items);
  }

  @Post('ask')
  @HttpCode(204)
  async ask(
    @CurrentSession() session: Session,
    @Body({ schema: wishAskBody }) body: WishAskBody,
  ): Promise<void> {
    await this.wishlist.ask(session.playerId, body);
  }
}
