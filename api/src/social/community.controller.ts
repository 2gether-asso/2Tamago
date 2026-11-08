import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { CurrentSession, type Session } from '../auth/session.js';
import { CommunityService } from './community.service.js';

@Controller('community')
export class CommunityController {
  constructor(private readonly community: CommunityService) {}

  @Get('goal')
  goal(@CurrentSession() session: Session) {
    return this.community.current(session.playerId);
  }

  @Post('goal/claim')
  @HttpCode(200)
  claim(@CurrentSession() session: Session) {
    return this.community.claim(session.playerId);
  }
}
