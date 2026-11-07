import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AppConfig } from '../config/app-config.js';
import { PlayersModule } from '../players/players.module.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { DiscordClient } from './discord.client.js';

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({ secret: config.auth.secret }),
    }),
    PlayersModule,
  ],
  controllers: [AuthController],
  providers: [DiscordClient, { provide: APP_GUARD, useClass: AuthGuard }],
})
export class AuthModule {}
