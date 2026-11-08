import { Module } from '@nestjs/common';
import { PetsModule } from '../pets/pets.module.js';
import { ProfileController } from './profile.controller.js';
import { ProfileService } from './profile.service.js';

@Module({
  imports: [PetsModule],
  controllers: [ProfileController],
  providers: [ProfileService],
})
export class ProfileModule {}
