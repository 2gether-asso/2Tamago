import { Controller, Get, Inject } from '@nestjs/common';
import type { GameRules } from '@2tamago/core';
import { Public } from '../auth/session.js';
import { GAME_RULES } from '../common/tokens.js';

@Public()
@Controller('game')
export class GameController {
  constructor(@Inject(GAME_RULES) private readonly rules: GameRules) {}

  /** The rules in use, so the web app runs the same simulation. */
  @Get('rules')
  getRules(): GameRules {
    return this.rules;
  }
}
