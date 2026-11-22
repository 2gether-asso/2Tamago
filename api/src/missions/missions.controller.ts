import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { CurrentSession, type Session } from '../auth/session.js';
import { MissionsService } from './missions.service.js';

@Controller('missions')
export class MissionsController {
  constructor(private readonly missions: MissionsService) {}

  @Get()
  today(@CurrentSession() session: Session) {
    return this.missions.today(session.playerId);
  }

  @Post('claim')
  @HttpCode(200)
  claim(@CurrentSession() session: Session) {
    return this.missions.claim(session.playerId);
  }
}
