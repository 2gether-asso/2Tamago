import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import {
  rulesOverridesBody,
  type AdminRulesResponse,
  type AdminStats,
  type RulesOverridesBody,
} from '@2tamago/core/contracts';
import { AdminGuard } from './admin.guard.js';
import { AdminStatsService } from './admin-stats.service.js';
import { GameRulesService } from './game-rules.service.js';

@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly rules: GameRulesService,
    private readonly stats: AdminStatsService,
  ) {}

  /** Figures about the whole game, to follow it and to balance it. */
  @Get('stats')
  getStats(): Promise<AdminStats> {
    return this.stats.get();
  }

  @Get('rules')
  getRules(): AdminRulesResponse {
    return this.rules.state;
  }

  /** Replaces the overrides; `{}` goes back to the defaults. */
  @Put('rules')
  saveRules(
    @Body({ schema: rulesOverridesBody }) overrides: RulesOverridesBody,
  ): Promise<AdminRulesResponse> {
    return this.rules.save(overrides);
  }
}
