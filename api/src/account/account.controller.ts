import { Body, Controller, Delete, Get, HttpCode, Param, Put } from '@nestjs/common';
import {
  accountDeleteBody,
  accountNameBody,
  uuidParam,
  type AccountDeleteBody,
  type AccountNameBody,
  type AccountOverview,
} from '@2tamago/core/contracts';
import { CurrentSession, type Session } from '../auth/session.js';
import { AccountService } from './account.service.js';

/** What a player manages about their own account: name and sign-ins. */
@Controller('account')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Get()
  get(@CurrentSession() session: Session): Promise<AccountOverview> {
    return this.account.get(session.playerId, session.sessionId);
  }

  @Put('name')
  @HttpCode(204)
  async rename(
    @CurrentSession() session: Session,
    @Body({ schema: accountNameBody }) body: AccountNameBody,
  ): Promise<void> {
    await this.account.rename(session.playerId, body.name);
  }

  /** Erases the account for good (the body confirms with the displayed name). */
  @Delete()
  @HttpCode(204)
  async delete(
    @CurrentSession() session: Session,
    @Body({ schema: accountDeleteBody }) body: AccountDeleteBody,
  ): Promise<void> {
    await this.account.delete(session.playerId, body.confirm);
  }

  /** Signs out every other device. */
  @Delete('sessions')
  @HttpCode(204)
  async revokeOthers(@CurrentSession() session: Session): Promise<void> {
    await this.account.revokeOthers(session.playerId, session.sessionId);
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  async revoke(
    @CurrentSession() session: Session,
    @Param('id', { schema: uuidParam }) id: string,
  ): Promise<void> {
    await this.account.revoke(session.playerId, id);
  }
}
