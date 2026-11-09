import * as Sentry from '@sentry/node';
import { Injectable } from '@nestjs/common';
import type { FeedbackReport } from './feedback-report.js';

/** Delivers a feedback report. Abstract so the e2e tests can capture reports instead. */
export abstract class FeedbackReporter {
  abstract report(report: FeedbackReport): Promise<void>;
}

@Injectable()
export class SentryFeedbackReporter extends FeedbackReporter {
  override async report(report: FeedbackReport): Promise<void> {
    // A plain message event, not captureMessage(): that one attaches a synthetic exception with
    // the reporter's own stack trace, and GlitchTip then titles the issue after the code frame
    // instead of the player's message.
    Sentry.captureEvent({
      message: report.message,
      level: report.level,
      tags: report.tags,
      fingerprint: report.fingerprint,
      user: report.user,
      extra: report.extra,
    });
    // Best effort: do not make the player wait long for a slow GlitchTip.
    await Sentry.flush(2000);
  }
}
