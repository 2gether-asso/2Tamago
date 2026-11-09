import { Module } from '@nestjs/common';
import { PetsModule } from '../pets/pets.module.js';
import { PlayersModule } from '../players/players.module.js';
import { WorkController } from './work.controller.js';
import { WorkService } from './work.service.js';

@Module({
  imports: [PlayersModule, PetsModule],
  controllers: [WorkController],
  providers: [WorkService],
})
export class WorkModule {}
