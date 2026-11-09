import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module.js';
import { PlayersModule } from '../players/players.module.js';
import { ShopController } from './shop.controller.js';

@Module({
  imports: [PlayersModule, EventsModule],
  controllers: [ShopController],
})
export class ShopModule {}
