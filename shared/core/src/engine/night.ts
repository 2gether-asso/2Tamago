import { gameHours, type BedtimeWindow, type GameRules } from './rules.js';
import type { Stage } from './types.js';

/** Hour of the game day (0 to 24) at real time `t`. One game day is 24 game hours. */
export function dayHour(rules: GameRules, t: number): number {
  const hour = (t / gameHours(rules, 1) + rules.night.clockOffsetHours) % 24;
  return hour < 0 ? hour + 24 : hour;
}

/** The night of a stage: its own bedtime if it has one, else the general one. */
export function bedtimeOf(rules: GameRules, stage?: Stage): BedtimeWindow {
  const { startHour, endHour, stages } = rules.night;
  return (stage && stages[stage]) || { startHour, endHour };
}

/** Whether it is night, for a pet of `stage` (the general night without a stage), at real time `t`. */
export function isNight(rules: GameRules, t: number, stage?: Stage): boolean {
  const { startHour, endHour } = bedtimeOf(rules, stage);
  if (startHour === endHour) return false;
  const hour = dayHour(rules, t);
  return startHour < endHour
    ? hour >= startHour && hour < endHour
    : hour >= startHour || hour < endHour;
}

/**
 * Whether the lights may go off for a pet of `stage`: at night, or in the `tuckInHours` before its
 * bedtime (an owner who visits in the early evening can put it to bed before leaving). With the
 * lights off in that window, it sleeps on until morning.
 */
export function isBedtime(rules: GameRules, t: number, stage?: Stage): boolean {
  if (isNight(rules, t, stage)) return true;
  const { startHour, endHour } = bedtimeOf(rules, stage);
  const early = rules.night.tuckInHours ?? 0;
  if (startHour === endHour || early <= 0) return false;
  const before = (startHour - dayHour(rules, t) + 24) % 24;
  return before > 0 && before <= early;
}
