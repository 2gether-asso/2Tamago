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
