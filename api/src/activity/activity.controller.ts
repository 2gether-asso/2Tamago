import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { CurrentSession, type Session } from '../auth/session.js';
import { ActivityService } from './activity.service.js';

@Controller('activity')
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get()
  list(@CurrentSession() session: Session) {
    return this.activity.list(session.playerId);
  }

  @Post('read')
  @HttpCode(204)
  async markRead(@CurrentSession() session: Session) {
    await this.activity.markAllRead(session.playerId);
  }
}
