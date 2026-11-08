import { Controller, Get } from '@nestjs/common';
import type { GameRules } from '@2tamago/core';
import { Public } from '../auth/session.js';
import { GameRulesService } from './game-rules.service.js';

@Public()
@Controller('game')
export class GameController {
  constructor(private readonly rules: GameRulesService) {}

  /** The rules in use, so the web app runs the same simulation. */
  @Get('rules')
  getRules(): GameRules {
    return this.rules.current;
  }
}
