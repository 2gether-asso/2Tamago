import { createHash } from 'node:crypto';
import type { FeedbackBody, FeedbackType } from '@2tamago/core/contracts';

/** What gets sent to Sentry or GlitchTip. Kept free of any SDK type so it is easy to test. */
export interface FeedbackReport {
  /** Issue title: `[Bug] first line of the message`. */
  message: string;
  level: 'error' | 'warning' | 'info';
  tags: Record<string, string>;
  /** Identical messages of the same type land in the same issue, which then counts them. */
  fingerprint: string[];
  user: { id: string; username: string };
  extra: { message: string; page: string | null; userAgent: string | null };
}

const LABELS: Record<FeedbackType, string> = { bug: 'Bug', idea: 'Idée', other: 'Autre' };

/** Severity follows the type: a bug is an error, an idea is information, the rest needs triage. */
const LEVELS: Record<FeedbackType, FeedbackReport['level']> = {
  bug: 'error',
  idea: 'info',
  other: 'warning',
};

const TITLE_LENGTH = 80;

export function buildFeedbackReport(
  feedback: FeedbackBody,
  player: { id: string; displayName: string },
  userAgent: string | null,
): FeedbackReport {
  const firstLine = feedback.message.split('\n')[0]!.trim();
  const summary =
    firstLine.length > TITLE_LENGTH ? `${firstLine.slice(0, TITLE_LENGTH - 1)}…` : firstLine;
  const digest = createHash('sha1')
    .update(feedback.message.toLowerCase().replace(/\s+/g, ' '))
    .digest('hex');
  return {
    message: `[${LABELS[feedback.type]}] ${summary}`,
    level: LEVELS[feedback.type],
    tags: {
      kind: 'feedback',
      feedback_type: feedback.type,
      ...(feedback.page ? { page: feedback.page } : {}),
    },
    fingerprint: ['feedback', feedback.type, digest],
    user: { id: player.id, username: player.displayName },
    extra: { message: feedback.message, page: feedback.page ?? null, userAgent },
  };
}
