import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module.js';
import { PetsModule } from '../pets/pets.module.js';
import { PlayersModule } from '../players/players.module.js';
import { SocialController } from './social.controller.js';
import { VillageService } from './village.service.js';
import { WalksService } from './walks.service.js';

@Module({
  imports: [PetsModule, PlayersModule, ActivityModule],
  controllers: [SocialController],
  providers: [VillageService, WalksService],
})
export class SocialModule {}
