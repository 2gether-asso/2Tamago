import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  blockedWordsBody,
  renameBody,
  uuidParam,
  type BlockedWordsBody,
  type RenameBody,
} from '@2tamago/core/contracts';
import { CurrentSession, type Session } from '../auth/session.js';
import { AdminGuard } from '../game/admin.guard.js';
import { ModerationService } from './moderation.service.js';

@UseGuards(AdminGuard)
@Controller('admin/moderation')
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}

  @Get('search')
  search(@Query('q') query = '') {
    const q = query.trim();
    return q.length < 2 ? [] : this.moderation.search(q.slice(0, 40));
  }

  @Put('pets/:petId/name')
  @HttpCode(204)
  async renamePet(
    @CurrentSession() session: Session,
    @Param('petId', { schema: uuidParam }) petId: string,
    @Body({ schema: renameBody }) body: RenameBody,
  ): Promise<void> {
    await this.moderation.renamePet(session.playerId, petId, body.name);
  }

  @Put('players/:playerId/name')
  @HttpCode(204)
  async renamePlayer(
    @CurrentSession() session: Session,
    @Param('playerId', { schema: uuidParam }) playerId: string,
    @Body({ schema: renameBody }) body: RenameBody,
  ): Promise<void> {
    await this.moderation.renamePlayer(session.playerId, playerId, body.name);
  }

  @Delete('players/:playerId/name')
  @HttpCode(204)
  async unlockPlayer(
    @CurrentSession() session: Session,
    @Param('playerId', { schema: uuidParam }) playerId: string,
  ): Promise<void> {
    await this.moderation.unlockPlayer(session.playerId, playerId);
  }

  @Get('blocked-words')
  async blockedWords(): Promise<BlockedWordsBody> {
    return { words: await this.moderation.blockedWords() };
  }

  @Put('blocked-words')
  async saveBlockedWords(
    @CurrentSession() session: Session,
    @Body({ schema: blockedWordsBody }) body: BlockedWordsBody,
  ): Promise<BlockedWordsBody> {
    return { words: await this.moderation.saveBlockedWords(session.playerId, body.words) };
  }

  @Get('log')
  log() {
    return this.moderation.log();
  }
}
