import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import {
  giftBody,
  uuidParam,
  walkBody,
  type FavoriteResponse,
  type GiftBody,
  type WalkBody,
} from '@2tamago/core/contracts';
import { CurrentSession, type Session } from '../auth/session.js';
import { FavoritesService } from './favorites.service.js';
import { VillageService } from './village.service.js';
import { WalksService } from './walks.service.js';

@Controller()
export class SocialController {
  constructor(
    private readonly village: VillageService,
    private readonly walks: WalksService,
    private readonly favorites: FavoritesService,
  ) {}

  @Post('pet/walk')
  @HttpCode(200)
  startWalk(@CurrentSession() session: Session, @Body({ schema: walkBody }) body: WalkBody) {
    return this.walks.start(session.playerId, body.zone);
  }

  @Post('pet/walk/return')
  @HttpCode(200)
  returnFromWalk(@CurrentSession() session: Session) {
    return this.walks.return(session.playerId);
  }

  @Get('village')
  list(@CurrentSession() session: Session) {
    return this.village.list(session.playerId);
  }

  @Get('village/:petId')
  visit(@CurrentSession() session: Session, @Param('petId', { schema: uuidParam }) petId: string) {
    return this.village.visit(session.playerId, petId);
  }

  @Post('village/:petId/caress')
  @HttpCode(200)
  caress(@CurrentSession() session: Session, @Param('petId', { schema: uuidParam }) petId: string) {
    return this.village.caress(session.playerId, petId);
  }

  @Post('village/:petId/gift')
  @HttpCode(200)
  gift(
    @CurrentSession() session: Session,
    @Param('petId', { schema: uuidParam }) petId: string,
    @Body({ schema: giftBody }) body: GiftBody,
  ) {
    return this.village.gift(session.playerId, petId, body.item);
  }

  @Put('players/:playerId/favorite')
  async follow(
    @CurrentSession() session: Session,
    @Param('playerId', { schema: uuidParam }) playerId: string,
  ): Promise<FavoriteResponse> {
    return { favorite: await this.favorites.set(session.playerId, playerId, true) };
  }

  @Delete('players/:playerId/favorite')
  async unfollow(
    @CurrentSession() session: Session,
    @Param('playerId', { schema: uuidParam }) playerId: string,
  ): Promise<FavoriteResponse> {
    return { favorite: await this.favorites.set(session.playerId, playerId, false) };
  }
}
