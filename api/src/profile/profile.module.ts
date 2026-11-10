import { Module } from '@nestjs/common';
import { PetsModule } from '../pets/pets.module.js';
import { PlayersModule } from '../players/players.module.js';
import { ProfileController } from './profile.controller.js';
import { ProfileService } from './profile.service.js';

@Module({
  imports: [PetsModule, PlayersModule],
  controllers: [ProfileController],
  providers: [ProfileService],
})
export class ProfileModule {}
