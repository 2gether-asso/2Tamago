import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module.js';
import { PetsModule } from '../pets/pets.module.js';
import { ModerationController } from './moderation.controller.js';
import { ModerationService } from './moderation.service.js';
import { NamesModule } from './names.module.js';

@Module({
  imports: [PetsModule, ActivityModule, NamesModule],
  controllers: [ModerationController],
  providers: [ModerationService],
})
export class ModerationModule {}
