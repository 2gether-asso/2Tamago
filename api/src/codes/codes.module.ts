import { Module } from '@nestjs/common';
import { PlayersModule } from '../players/players.module.js';
import { AdminCodesController, CodesController } from './codes.controller.js';
import { CodesService } from './codes.service.js';

@Module({
  imports: [PlayersModule],
  controllers: [CodesController, AdminCodesController],
  providers: [CodesService],
})
export class CodesModule {}
