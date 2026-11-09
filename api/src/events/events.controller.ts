import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { eventBody, uuidParam, type EventBody } from '@2tamago/core/contracts';
import { CurrentSession, type Session } from '../auth/session.js';
import { AdminGuard } from '../game/admin.guard.js';
import { EventsService } from './events.service.js';

@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  /** The bonuses on now and announced: everyone may know. */
  @Get()
  overview() {
    return this.events.overview();
  }
}

@UseGuards(AdminGuard)
@Controller('admin/events')
export class AdminEventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  list() {
    return this.events.list();
  }

  @Post()
  create(@CurrentSession() session: Session, @Body({ schema: eventBody }) body: EventBody) {
    return this.events.create(session.playerId, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async cancel(@Param('id', { schema: uuidParam }) id: string): Promise<void> {
    await this.events.cancel(id);
  }
}
