import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  giftCodeBody,
  redeemBody,
  uuidParam,
  type GiftCodeBody,
  type RedeemBody,
} from '@2tamago/core/contracts';
import { CurrentSession, type Session } from '../auth/session.js';
import { AdminGuard } from '../game/admin.guard.js';
import { CodesService } from './codes.service.js';

@Controller('codes')
export class CodesController {
  constructor(private readonly codes: CodesService) {}

  /** Few tries a minute: a code is not to be guessed. */
  @Post('redeem')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  redeem(@CurrentSession() session: Session, @Body({ schema: redeemBody }) body: RedeemBody) {
    return this.codes.redeem(session.playerId, body.code);
  }
}

@UseGuards(AdminGuard)
@Controller('admin/codes')
export class AdminCodesController {
  constructor(private readonly codes: CodesService) {}

  @Get()
  list() {
    return this.codes.list();
  }

  @Post()
  create(@CurrentSession() session: Session, @Body({ schema: giftCodeBody }) body: GiftCodeBody) {
    return this.codes.create(session.playerId, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async disable(@Param('id', { schema: uuidParam }) id: string): Promise<void> {
    await this.codes.disable(id);
  }
}
