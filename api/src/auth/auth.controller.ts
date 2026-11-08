import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { devLoginBody, type DevLoginBody } from '@2tamago/core/contracts';
import type { CookieOptions, Request, Response } from 'express';
import { captureError } from '../common/error-reporter.js';
import { AppConfig } from '../config/app-config.js';
import { PlayersService } from '../players/players.service.js';
import { DiscordClient, type DiscordIdentity } from './discord.client.js';
import { OAUTH_STATE_COOKIE, Public, SESSION_COOKIE, readCookie } from './session.js';

const SESSION_DAYS = 30;

@Public()
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly config: AppConfig,
    private readonly jwt: JwtService,
    private readonly discord: DiscordClient,
    private readonly players: PlayersService,
  ) {}

  /** What the login page should offer. */
  @Get('config')
  getConfig() {
    return {
      discord: this.discord.enabled,
      devLogin: this.config.auth.devLogin,
      inviteUrl: this.config.discordInviteUrl ?? null,
    };
  }

  @Get('discord')
  discordLogin(@Res() res: Response) {
    const state = randomBytes(24).toString('base64url');
    res.cookie(OAUTH_STATE_COOKIE, state, { ...this.cookieOptions(), maxAge: 10 * 60_000 });
    res.redirect(this.discord.authorizeUrl(state));
  }

  @Get('discord/callback')
  async discordCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') providerError: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const expected = readCookie(req, OAUTH_STATE_COOKIE);
    res.clearCookie(OAUTH_STATE_COOKIE, this.cookieOptions());
    if (!state || !expected || !safeEqual(state, expected)) {
      return res.redirect(`${this.config.webOrigin}/login?error=state`);
    }
    // The player cancelled on Discord's authorization screen (`error=access_denied`).
    if (providerError || !code) {
      return res.redirect(`${this.config.webOrigin}/login?error=denied`);
    }
    let identity: DiscordIdentity;
    try {
      identity = await this.discord.identify(code);
    } catch (error) {
      // Discord is down or refused us: say so, instead of showing a JSON error page.
      this.logger.warn(`Discord sign-in failed: ${(error as Error).message}`);
      captureError(error);
      return res.redirect(`${this.config.webOrigin}/login?error=discord`);
    }
    if (!identity.isMember) {
      return res.redirect(`${this.config.webOrigin}/login?error=not_member`);
    }
    const player = await this.players.upsertFromLogin({
      discordId: identity.id,
      displayName: identity.displayName,
      avatarUrl: identity.avatarUrl,
    });
    await this.startSession(res, player.id, this.config.auth.adminDiscordIds.includes(identity.id));
    return res.redirect(`${this.config.webOrigin}/`);
  }

  /** Development only: sign in with just a name. */
  @Post('dev-login')
  @HttpCode(200)
  async devLogin(
    @Body({ schema: devLoginBody }) body: DevLoginBody,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!this.config.auth.devLogin) throw new NotFoundException();
    const discordId = `dev:${body.name.toLowerCase()}`;
    const player = await this.players.upsertFromLogin({
      discordId,
      displayName: body.name,
      avatarUrl: null,
    });
    const token = await this.startSession(
      res,
      player.id,
      this.config.auth.adminDiscordIds.includes(discordId),
    );
    return { token };
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE, this.cookieOptions());
  }

  private async startSession(res: Response, playerId: string, isAdmin: boolean): Promise<string> {
    const token = await this.jwt.signAsync(
      { sub: playerId, adm: isAdmin || undefined },
      { expiresIn: `${SESSION_DAYS}d` },
    );
    res.cookie(SESSION_COOKIE, token, {
      ...this.cookieOptions(),
      maxAge: SESSION_DAYS * 24 * 3_600_000,
    });
    return token;
  }

  private cookieOptions(): CookieOptions {
    return { httpOnly: true, sameSite: 'lax', secure: this.config.auth.cookieSecure, path: '/' };
  }
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
