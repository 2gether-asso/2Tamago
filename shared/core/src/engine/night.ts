import { gameHours, type GameRules } from './rules.js';

/** Hour of the game day (0 to 24) at real time `t`. One game day is 24 game hours. */
export function dayHour(rules: GameRules, t: number): number {
  const hour = (t / gameHours(rules, 1) + rules.night.clockOffsetHours) % 24;
  return hour < 0 ? hour + 24 : hour;
}

/** Whether it is night at real time `t`. */
export function isNight(rules: GameRules, t: number): boolean {
  const { startHour, endHour } = rules.night;
  if (startHour === endHour) return false;
  const hour = dayHour(rules, t);
  return startHour < endHour
    ? hour >= startHour && hour < endHour
    : hour >= startHour || hour < endHour;
}
