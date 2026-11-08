import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { Throttle } from '@nestjs/throttler';
import { feedbackBody, type FeedbackBody } from '@2tamago/core/contracts';
import { CurrentSession, type Session } from '../auth/session.js';
import { AppConfig } from '../config/app-config.js';
import type { Database } from '../database/database.js';
import { PlayersService } from '../players/players.service.js';
import { buildFeedbackReport } from './feedback-report.js';
import { FeedbackReporter } from './feedback-reporter.js';

@Controller('feedback')
export class FeedbackController {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    @Inject(PlayersService) private readonly players: PlayersService,
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(FeedbackReporter) private readonly reporter: FeedbackReporter,
  ) {}

  /** An idea, a bug or anything else from a player, tracked as an issue in GlitchTip. */
  @Post()
  @HttpCode(204)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async send(
    @CurrentSession() session: Session,
    @Body({ schema: feedbackBody }) body: FeedbackBody,
    @Headers('user-agent') userAgent: string | undefined,
  ): Promise<void> {
    if (!this.config.sentryDsn) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        code: 'feedback_disabled',
      });
    }
    const player = await this.players.get(this.db, session.playerId);
    await this.reporter.report(
      buildFeedbackReport(
        body,
        { id: player.id, displayName: player.displayName },
        userAgent ?? null,
      ),
    );
  }
}
