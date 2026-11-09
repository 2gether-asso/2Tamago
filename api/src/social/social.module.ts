import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module.js';
import { PetsModule } from '../pets/pets.module.js';
import { PlayersModule } from '../players/players.module.js';
import { PushModule } from '../push/push.module.js';
import { CommunityController } from './community.controller.js';
import { CommunityService } from './community.service.js';
import { DaycareController } from './daycare.controller.js';
import { DaycareService } from './daycare.service.js';
import { FavoritesService } from './favorites.service.js';
import { SocialController } from './social.controller.js';
import { VillageService } from './village.service.js';
import { WalksService } from './walks.service.js';

@Module({
  imports: [PetsModule, PlayersModule, ActivityModule, PushModule],
  controllers: [SocialController, CommunityController, DaycareController],
  providers: [VillageService, WalksService, FavoritesService, CommunityService, DaycareService],
})
export class SocialModule {}
