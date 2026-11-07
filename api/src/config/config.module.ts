import { Global, Module } from '@nestjs/common';
import { withRules } from '@2tamago/core';
import { AppConfig } from './app-config.js';
import { Clock } from '../common/clock.js';
import { GAME_RULES } from '../common/tokens.js';

@Global()
@Module({
  providers: [
    { provide: AppConfig, useFactory: () => new AppConfig() },
    Clock,
    {
      provide: GAME_RULES,
      inject: [AppConfig],
      useFactory: (config: AppConfig) =>
        withRules({
          timeScale: config.game.timeScale,
          departureEnabled: config.game.departureEnabled,
        }),
    },
  ],
  exports: [AppConfig, Clock, GAME_RULES],
})
export class ConfigModule {}
