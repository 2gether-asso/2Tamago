import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { workBody, type WorkBody } from '@2tamago/core/contracts';
import { CurrentSession, type Session } from '../auth/session.js';
import { WorkService } from './work.service.js';

@Controller('work')
export class WorkController {
  constructor(private readonly work: WorkService) {}

  @Get()
  status(@CurrentSession() session: Session) {
    return this.work.status(session.playerId);
  }

  @Post('player')
  @HttpCode(200)
  player(@CurrentSession() session: Session, @Body({ schema: workBody }) body: WorkBody) {
    return this.work.workPlayer(session.playerId, body.score);
  }

  @Post('pet')
  @HttpCode(200)
  pet(@CurrentSession() session: Session) {
    return this.work.workPet(session.playerId);
  }
}
