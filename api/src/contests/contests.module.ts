import { Module } from '@nestjs/common';
import { PetsModule } from '../pets/pets.module.js';
import { PlayersModule } from '../players/players.module.js';
import { ContestsController } from './contests.controller.js';
import { ContestsService } from './contests.service.js';

@Module({
  imports: [PlayersModule, PetsModule],
  controllers: [ContestsController],
  providers: [ContestsService],
})
export class ContestsModule {}
