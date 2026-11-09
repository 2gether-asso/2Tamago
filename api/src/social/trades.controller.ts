import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { tradeBody, uuidParam, type TradeBody } from '@2tamago/core/contracts';
import { CurrentSession, type Session } from '../auth/session.js';
import { TradesService } from './trades.service.js';

@Controller('trades')
export class TradesController {
  constructor(private readonly trades: TradesService) {}

  @Get()
  overview(@CurrentSession() session: Session) {
    return this.trades.overview(session.playerId);
  }

  @Get('targets/:id')
  target(@Param('id', { schema: uuidParam }) id: string) {
    return this.trades.target(id);
  }

  @Post()
  offer(@CurrentSession() session: Session, @Body({ schema: tradeBody }) body: TradeBody) {
    return this.trades.offer(session.playerId, body);
  }

  @Post(':id/accept')
  @HttpCode(200)
  accept(@CurrentSession() session: Session, @Param('id', { schema: uuidParam }) id: string) {
    return this.trades.accept(session.playerId, id);
  }

  @Post(':id/decline')
  @HttpCode(204)
  async decline(
    @CurrentSession() session: Session,
    @Param('id', { schema: uuidParam }) id: string,
  ): Promise<void> {
    await this.trades.decline(session.playerId, id);
  }

  @Delete(':id')
  @HttpCode(204)
  async cancel(
    @CurrentSession() session: Session,
    @Param('id', { schema: uuidParam }) id: string,
  ): Promise<void> {
    await this.trades.cancel(session.playerId, id);
  }
}
