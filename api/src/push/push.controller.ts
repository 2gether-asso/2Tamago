import { Body, Controller, Delete, HttpCode, Post, Put } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  pushSubscriptionBody,
  pushUnsubscribeBody,
  type PushSubscriptionBody,
  type PushUnsubscribeBody,
} from '@2tamago/core/contracts';
import { CurrentSession, type Session } from '../auth/session.js';
import { PushService } from './push.service.js';

@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  @Put('subscription')
  @HttpCode(204)
  async subscribe(
    @CurrentSession() session: Session,
    @Body({ schema: pushSubscriptionBody }) body: PushSubscriptionBody,
  ): Promise<void> {
    await this.push.subscribe(session.playerId, body);
  }

  @Delete('subscription')
  @HttpCode(204)
  async unsubscribe(
    @CurrentSession() session: Session,
    @Body({ schema: pushUnsubscribeBody }) body: PushUnsubscribeBody,
  ): Promise<void> {
    await this.push.unsubscribe(session.playerId, body.endpoint);
  }

  @Post('test')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async test(@CurrentSession() session: Session): Promise<{ sent: number }> {
    return { sent: await this.push.test(session.playerId) };
  }
}
