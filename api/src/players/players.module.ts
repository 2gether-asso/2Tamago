import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module.js';
import { PlayersService } from './players.service.js';

@Module({
  imports: [ActivityModule],
  providers: [PlayersService],
  exports: [PlayersService],
})
export class PlayersModule {}
