import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { NamesModule } from '../moderation/names.module.js';
import { PlayersModule } from '../players/players.module.js';
import { AccountController } from './account.controller.js';
import { AccountService } from './account.service.js';

@Module({
  imports: [AuthModule, NamesModule, PlayersModule],
  controllers: [AccountController],
  providers: [AccountService],
})
export class AccountModule {}
