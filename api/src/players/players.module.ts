import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module.js';
import { EventsModule } from '../events/events.module.js';
import { PlayersService } from './players.service.js';

@Module({
  imports: [ActivityModule, EventsModule],
  providers: [PlayersService],
  exports: [PlayersService],
})
export class PlayersModule {}
