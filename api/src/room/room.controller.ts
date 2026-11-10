import { Body, Controller, Put } from '@nestjs/common';
import { roomBody, type RoomBody } from '@2tamago/core/contracts';
import type { Room } from '@2tamago/core';
import { CurrentSession, type Session } from '../auth/session.js';
import { PlayersService } from '../players/players.service.js';

/** The player's room: which decoration they own is on display. */
@Controller('room')
export class RoomController {
  constructor(private readonly players: PlayersService) {}

  /** Replaces the whole room (the rules are the engine's `roomProblem`). */
  @Put()
  set(
    @CurrentSession() session: Session,
    @Body({ schema: roomBody }) body: RoomBody,
  ): Promise<Room> {
    return this.players.setRoom(session.playerId, body);
  }
}
