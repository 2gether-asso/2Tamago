import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  careActionBody,
  daycareBody,
  uuidParam,
  type CareActionBody,
  type DaycareBody,
} from '@2tamago/core/contracts';
import { CurrentSession, type Session } from '../auth/session.js';
import { DaycareService } from './daycare.service.js';

@Controller('daycare')
export class DaycareController {
  constructor(private readonly daycare: DaycareService) {}

  @Get()
  overview(@CurrentSession() session: Session) {
    return this.daycare.overview(session.playerId);
  }

  @Post()
  invite(@CurrentSession() session: Session, @Body({ schema: daycareBody }) body: DaycareBody) {
    return this.daycare.invite(session.playerId, body.caretakerId);
  }

  @Post(':id/accept')
  @HttpCode(200)
  accept(@CurrentSession() session: Session, @Param('id', { schema: uuidParam }) id: string) {
    return this.daycare.accept(session.playerId, id);
  }

  @Post(':id/decline')
  @HttpCode(204)
  async decline(
    @CurrentSession() session: Session,
    @Param('id', { schema: uuidParam }) id: string,
  ): Promise<void> {
    await this.daycare.decline(session.playerId, id);
  }

  @Delete(':id')
  @HttpCode(204)
  async end(
    @CurrentSession() session: Session,
    @Param('id', { schema: uuidParam }) id: string,
  ): Promise<void> {
    await this.daycare.end(session.playerId, id);
  }

  @Post(':id/care')
  @HttpCode(201)
  care(
    @CurrentSession() session: Session,
    @Param('id', { schema: uuidParam }) id: string,
    @Body({ schema: careActionBody }) body: CareActionBody,
  ) {
    return this.daycare.care(session.playerId, id, body);
  }
}
