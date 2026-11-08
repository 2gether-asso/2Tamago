import { Module } from '@nestjs/common';
import { PlayersModule } from '../players/players.module.js';
import { FeedbackController } from './feedback.controller.js';
import { FeedbackReporter, SentryFeedbackReporter } from './feedback-reporter.js';

@Module({
  imports: [PlayersModule],
  controllers: [FeedbackController],
  providers: [{ provide: FeedbackReporter, useClass: SentryFeedbackReporter }],
})
export class FeedbackModule {}
