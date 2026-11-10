import { Module } from '@nestjs/common';
import { PlayersModule } from '../players/players.module.js';
import { RoomController } from './room.controller.js';

@Module({ imports: [PlayersModule], controllers: [RoomController] })
export class RoomModule {}
