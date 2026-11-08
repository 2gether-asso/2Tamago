import { buildFeedbackReport } from './feedback-report.js';

const player = { id: 'p1', displayName: 'Mathieu' };

describe('buildFeedbackReport', () => {
  it('maps the type to a severity and a readable title', () => {
    const report = (type: 'bug' | 'idea' | 'other') =>
      buildFeedbackReport({ type, message: 'Le bouton ne répond plus\nDétails…' }, player, null);
    expect(report('bug')).toMatchObject({
      level: 'error',
      message: '[Bug] Le bouton ne répond plus',
    });
    expect(report('idea')).toMatchObject({
      level: 'info',
      message: '[Idée] Le bouton ne répond plus',
    });
    expect(report('other')).toMatchObject({ level: 'warning' });
  });

  it('tags the report, keeps the full text and identifies the player', () => {
    const report = buildFeedbackReport(
      { type: 'bug', message: 'Un message assez long', page: '/village' },
      player,
      'Firefox',
    );
    expect(report.tags).toEqual({ kind: 'feedback', feedback_type: 'bug', page: '/village' });
    expect(report.user).toEqual({ id: 'p1', username: 'Mathieu' });
    expect(report.extra).toEqual({
      message: 'Un message assez long',
      page: '/village',
      userAgent: 'Firefox',
    });
  });

  it('truncates long titles', () => {
    const { message } = buildFeedbackReport(
      { type: 'idea', message: 'x'.repeat(300) },
      player,
      null,
    );
    expect(message.length).toBeLessThanOrEqual('[Idée] '.length + 80);
    expect(message.endsWith('…')).toBe(true);
  });

  it('groups identical messages of the same type, but not across types', () => {
    const fp = (type: 'bug' | 'idea', message: string) =>
      buildFeedbackReport({ type, message }, player, null).fingerprint;
    expect(fp('bug', 'Même  texte  ici')).toEqual(fp('bug', 'même texte ici'));
    expect(fp('bug', 'Même texte ici')).not.toEqual(fp('idea', 'Même texte ici'));
  });
});
