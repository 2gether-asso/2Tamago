import { utcOffsetHours, weekOf } from './clock.js';

describe('utcOffsetHours', () => {
  it('follows daylight saving time', () => {
    expect(utcOffsetHours(Date.UTC(2026, 0, 15, 12), 'Europe/Paris')).toBe(1);
    expect(utcOffsetHours(Date.UTC(2026, 6, 15, 12), 'Europe/Paris')).toBe(2);
  });

  it('handles UTC, negative and fractional offsets', () => {
    expect(utcOffsetHours(Date.UTC(2026, 0, 15, 12), 'UTC')).toBe(0);
    expect(utcOffsetHours(Date.UTC(2026, 0, 15, 12), 'America/New_York')).toBe(-5);
    expect(utcOffsetHours(Date.UTC(2026, 0, 15, 12), 'Asia/Kolkata')).toBe(5.5);
  });

  it('is not thrown off by milliseconds', () => {
    expect(utcOffsetHours(Date.UTC(2026, 0, 15, 12, 30, 15, 999), 'Europe/Paris')).toBe(1);
  });
});

describe('weekOf', () => {
  it('runs from Monday to the next Monday, in the game time zone', () => {
    // Wednesday 2026-01-14, noon in Paris (UTC+1).
    const week = weekOf(Date.UTC(2026, 0, 14, 11), 'Europe/Paris');
    expect(week.id).toBe('2026-01-12');
    expect(week.startsAt).toBe(Date.UTC(2026, 0, 11, 23));
    expect(week.endsAt).toBe(Date.UTC(2026, 0, 18, 23));
  });

  it('switches at local midnight, not at UTC midnight', () => {
    // Sunday 23:30 in Paris is still the old week; Monday 00:30 is the next one.
    expect(weekOf(Date.UTC(2026, 0, 18, 22, 30), 'Europe/Paris').id).toBe('2026-01-12');
    expect(weekOf(Date.UTC(2026, 0, 18, 23, 30), 'Europe/Paris').id).toBe('2026-01-19');
    // A Monday and a Sunday belong to the same week.
    expect(weekOf(Date.UTC(2026, 0, 12, 12), 'UTC').id).toBe('2026-01-12');
    expect(weekOf(Date.UTC(2026, 0, 18, 12), 'UTC').id).toBe('2026-01-12');
  });

  it('follows daylight saving time over a week', () => {
    // The clocks went forward on Sunday 2026-03-29: that week is 167 hours long.
    const week = weekOf(Date.UTC(2026, 2, 25, 12), 'Europe/Paris');
    expect(week.id).toBe('2026-03-23');
    expect(week.startsAt).toBe(Date.UTC(2026, 2, 22, 23));
    expect(week.endsAt).toBe(Date.UTC(2026, 2, 29, 22));
  });
});
