import { Global, Module } from '@nestjs/common';
import { AdminController } from './admin.controller.js';
import { GameController } from './game.controller.js';
import { GameRulesService } from './game-rules.service.js';

@Global()
@Module({
  controllers: [GameController, AdminController],
  providers: [GameRulesService],
  exports: [GameRulesService],
})
export class GameModule {}
