import {
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  NotFoundException,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  devLoginBody,
  refreshBody,
  tokenBody,
  type DevLoginBody,
  type RefreshBody,
  type TokenBody,
  type TokenResponse,
} from '@2tamago/core/contracts';
import type { Request, Response } from 'express';
import { captureError } from '../common/error-reporter.js';
import { Clock } from '../common/clock.js';
import { AppConfig } from '../config/app-config.js';
import { PlayersService } from '../players/players.service.js';
import { AuthError } from './auth-error.js';
import { AuthSessionService } from './auth-session.service.js';
import { describeClient } from './client-info.js';
import { isPkceChallenge } from './crypto.js';
import { DiscordClient, type DiscordIdentity } from './discord.client.js';
import { verifyDpopProof } from './dpop.js';
import { Authenticated, CurrentSession, Public, type Session } from './session.js';

@Public()
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly config: AppConfig,
    private readonly clock: Clock,
    private readonly jwt: JwtService,
    private readonly discord: DiscordClient,
    private readonly players: PlayersService,
    private readonly sessions: AuthSessionService,
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

  /**
   * Starts a Discord sign-in. The web app sends the PKCE challenge of a secret it keeps; the
   * `state` Discord hands back is a signed value carrying it, so nothing is stored in a cookie.
   */
  @Get('discord')
  async discordLogin(@Query('code_challenge') challenge: string | undefined, @Res() res: Response) {
    if (!challenge || !isPkceChallenge(challenge)) {
      return res.redirect(`${this.config.webOrigin}/login?error=state`);
    }
    const state = await this.jwt.signAsync(
      { typ: 'oauth-state', cc: challenge },
      { expiresIn: '10m' },
    );
    return res.redirect(this.discord.authorizeUrl(state));
  }

  @Get('discord/callback')
  async discordCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') providerError: string | undefined,
    @Res() res: Response,
  ) {
    const challenge = await this.readState(state);
    if (!challenge) return res.redirect(`${this.config.webOrigin}/login?error=state`);
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
    // The browser trades this one-time code for tokens, proving it holds the PKCE secret and a key.
    const oneTimeCode = await this.sessions.createCode(player.id, challenge);
    return res.redirect(`${this.config.webOrigin}/login?code=${encodeURIComponent(oneTimeCode)}`);
  }

  /** Trades the one-time code, the PKCE verifier and a DPoP proof for the first tokens. */
  @Post('token')
  @HttpCode(200)
  async token(
    @Body({ schema: tokenBody }) body: TokenBody,
    @Req() req: Request,
  ): Promise<TokenResponse> {
    const proof = await this.checkProof(req);
    const playerId = await this.sessions.redeemCode(body.code, body.code_verifier);
    return this.sessions.start(playerId, proof, this.clientOf(req));
  }

  /** Renews the access token and rotates the refresh token (see `session-policy.ts`). */
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Body({ schema: refreshBody }) body: RefreshBody,
    @Req() req: Request,
  ): Promise<TokenResponse> {
    const proof = await this.checkProof(req);
    try {
      return await this.sessions.refresh(body.refresh_token, proof, this.clientOf(req));
    } catch (error) {
      if (error instanceof AuthError && error.code !== 'invalid_dpop') {
        this.logger.warn(`Refresh refused (${error.code}) from ${this.clientOf(req).ip}`);
      }
      throw error;
    }
  }

  /**
   * Development only: sign in with just a name. With a DPoP proof it opens a real session
   * (refresh token included, like the Discord flow); without, it returns only an access token.
   */
  @Post('dev-login')
  @HttpCode(200)
  async devLogin(
    @Body({ schema: devLoginBody }) body: DevLoginBody,
    @Req() req: Request,
  ): Promise<TokenResponse> {
    if (!this.config.auth.devLogin) throw new NotFoundException();
    const player = await this.players.upsertFromLogin({
      discordId: `dev:${body.name.toLowerCase()}`,
      displayName: body.name,
      avatarUrl: null,
    });
    if (!req.get('dpop')) return this.sessions.accessTokenOnly(player.id);
    const proof = await this.checkProof(req);
    return this.sessions.start(player.id, proof, this.clientOf(req));
  }

  /** Ends this session: its refresh token stops working. */
  @Authenticated()
  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentSession() session: Session) {
    if (session.sessionId) await this.sessions.revoke(session.sessionId);
  }

  private clientOf(req: Request) {
    return describeClient(req.ip, req.get('user-agent'));
  }

  /** The DPoP proof of this very request, made recently and never seen before. */
  private async checkProof(req: Request) {
    const proof = verifyDpopProof(req.get('dpop'), {
      method: req.method,
      path: req.path,
      now: this.clock.now(),
    });
    await this.sessions.consumeProof(proof);
    return proof;
  }

  /** The PKCE challenge inside a `state` we signed, or null if it is not ours or expired. */
  private async readState(state: string | undefined): Promise<string | null> {
    if (!state) return null;
    try {
      const payload = await this.jwt.verifyAsync<{ typ?: string; cc?: string }>(state);
      return payload.typ === 'oauth-state' && payload.cc && isPkceChallenge(payload.cc)
        ? payload.cc
        : null;
    } catch {
      return null;
    }
  }
}
