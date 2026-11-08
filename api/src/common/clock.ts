import { Injectable } from '@nestjs/common';

/** Time source of the game. Tests replace it to travel in time. */
@Injectable()
export class Clock {
  now(): number {
    return Date.now();
  }
}

/** Hours to add to UTC to get the wall-clock time in `timezone` at `time` (follows daylight saving). */
export function utcOffsetHours(time: number, timezone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
      .formatToParts(time)
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;
  const asUtc = Date.UTC(
    parts.year!,
    parts.month! - 1,
    parts.day!,
    parts.hour!,
    parts.minute!,
    parts.second!,
  );
  return (asUtc - Math.floor(time / 1000) * 1000) / 3_600_000;
}

/** Calendar day (YYYY-MM-DD) of `time` in the game's time zone. */
export function dayOf(time: number, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(time);
}
