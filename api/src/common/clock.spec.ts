import { utcOffsetHours } from './clock.js';

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
