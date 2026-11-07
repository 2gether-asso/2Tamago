import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  adoptBody,
  ownerActionBody,
  type AdoptBody,
  type OwnerActionBody,
} from '@2tamago/core/contracts';
import { CurrentSession, type Session } from '../auth/session.js';
import { PetsService } from './pets.service.js';

@Controller()
export class PetsController {
  constructor(private readonly pets: PetsService) {}

  /** Everything the home screen needs, in one call. */
  @Get('me')
  me(@CurrentSession() session: Session) {
    return this.pets.me(session.playerId, session.isAdmin);
  }

  @Post('pet')
  adopt(@CurrentSession() session: Session, @Body({ schema: adoptBody }) body: AdoptBody) {
    return this.pets.adopt(session.playerId, body);
  }

  @Post('pet/actions')
  act(
    @CurrentSession() session: Session,
    @Body({ schema: ownerActionBody }) body: OwnerActionBody,
  ) {
    return this.pets.act(session.playerId, body);
  }

  @Get('album')
  album(@CurrentSession() session: Session) {
    return this.pets.album(session.playerId);
  }
}
