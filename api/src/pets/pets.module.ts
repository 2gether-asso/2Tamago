import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module.js';
import { NamesModule } from '../moderation/names.module.js';
import { MissionsModule } from '../missions/missions.module.js';
import { PlayersModule } from '../players/players.module.js';
import { PetsController } from './pets.controller.js';
import { PetsService } from './pets.service.js';

@Module({
  imports: [MissionsModule, PlayersModule, ActivityModule, NamesModule],
  controllers: [PetsController],
  providers: [PetsService],
  exports: [PetsService],
})
export class PetsModule {}
