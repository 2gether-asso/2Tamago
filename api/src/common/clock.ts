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

export interface Week {
  /** The Monday of the week (YYYY-MM-DD, in the game's time zone): stable and sortable. */
  id: string;
  /** Monday 00:00 in the game's time zone (epoch ms). */
  startsAt: number;
  /** The next Monday 00:00 (epoch ms), exclusive. */
  endsAt: number;
}

/** The calendar week (Monday to Sunday) of `time` in the game's time zone. */
export function weekOf(time: number, timezone: string): Week {
  const [year, month, day] = dayOf(time, timezone).split('-').map(Number) as [
    number,
    number,
    number,
  ];
  const sinceMonday = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
  const midnight = (daysFromToday: number) => {
    const utc = Date.UTC(year, month - 1, day - sinceMonday + daysFromToday);
    // The offset depends on the day (daylight saving): look it up at the instant itself.
    const guess = utc - utcOffsetHours(utc, timezone) * 3_600_000;
    return utc - utcOffsetHours(guess, timezone) * 3_600_000;
  };
  const startsAt = midnight(0);
  return {
    id: new Date(Date.UTC(year, month - 1, day - sinceMonday)).toISOString().slice(0, 10),
    startsAt,
    endsAt: midnight(7),
  };
}
