import { Controller, Get, Param } from '@nestjs/common';
import { uuidParam } from '@2tamago/core/contracts';
import { CurrentSession, type Session } from '../auth/session.js';
import { ProfileService } from './profile.service.js';

@Controller('players')
export class ProfileController {
  constructor(private readonly profiles: ProfileService) {}

  @Get(':playerId')
  get(
    @CurrentSession() session: Session,
    @Param('playerId', { schema: uuidParam }) playerId: string,
  ) {
    return this.profiles.get(session.playerId, playerId);
  }
}
