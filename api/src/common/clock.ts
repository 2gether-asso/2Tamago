import { Injectable } from '@nestjs/common';

/** Time source of the game. Tests replace it to travel in time. */
@Injectable()
export class Clock {
  now(): number {
    return Date.now();
  }
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
