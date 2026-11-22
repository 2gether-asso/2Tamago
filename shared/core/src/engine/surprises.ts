import type { ItemId } from './catalog.js';
import { gameHours, type GameRules } from './rules.js';
import { hashSeed } from './traits.js';
import type { PetState } from './types.js';
import { ageInDays } from './view.js';
import { gameDay } from './weather.js';

/**
 * What breaks the routine: a themed day now and then (the same for everyone, like the weather),
 * the pet's birthday, and a present it brings its owner once the bond is strong. All pure: the
 * theme comes from the day, the birthday from the age; the server draws what a present holds.
 */

export const DAY_THEMES = ['picnic', 'festival', 'bubbles', 'training', 'lucky'] as const;
export type DayTheme = (typeof DAY_THEMES)[number];

/** What each theme changes. Names and texts are in the web app (`theme.<id>`). */
export const DAY_THEME_EFFECTS = {
  /** Every meal (the free ration included) is a picnic: extra happiness. */
  picnic: { feedHappiness: 5 },
  /** Games make it happier. */
  festival: { playHappinessFactor: 1.5 },
  /** Bath time is fun time. */
  bubbles: { cleanHappiness: 10 },
  /** Tricks are learnt faster. */
  training: { trainFactor: 1.5 },
  /** Walks bring back an item more often (applied by the server, see `rollFinds`). */
  lucky: { itemChanceFactor: 1.4 },
} as const satisfies Record<DayTheme, object>;

/** Out of 100 days, how many have a theme: often enough to be looked for, rare enough to stand out. */
export const THEMED_DAYS_PERCENT = 40;

/** The theme of the game day of real time `t`, or null for an ordinary day. */
export function dayThemeAt(rules: GameRules, t: number): DayTheme | null {
  const roll = hashSeed(`theme:${gameDay(rules, t)}`);
  if (roll % 100 >= THEMED_DAYS_PERCENT) return null;
  return DAY_THEMES[Math.floor(roll / 100) % DAY_THEMES.length]!;
}

/** A birthday every week of life: the pet turns 7, 14, 21… days old. */
export const BIRTHDAY_EVERY_DAYS = 7;

export const BIRTHDAY = {
  happiness: 20,
  bond: 5,
  /** Given by the server with the party. */
  item: 'cake' as ItemId,
  coins: 10,
};

/** Today the pet has its birthday (the whole game day it turns a multiple of a week old). */
export function isBirthday(state: PetState, t: number, rules: GameRules): boolean {
  if (state.status !== 'alive' || state.stage === 'egg') return false;
  const age = ageInDays(state, t, rules);
  return age > 0 && age % BIRTHDAY_EVERY_DAYS === 0;
}

/** Its birthday and the party has not been thrown yet. */
export function birthdayToCelebrate(state: PetState, t: number, rules: GameRules): boolean {
  return isBirthday(state, t, rules) && state.celebratedAge !== ageInDays(state, t, rules);
}

export const PRESENT = {
  /** Below this bond, the pet keeps what it finds for itself. */
  minBond: 50,
  /** Not before it has been a day with its owner, nor while it is still a baby. */
  minAgeHours: 12,
  /** What a present may be, by weight: coins it found, or an item. */
  table: [
    { weight: 40, coins: [5, 15] },
    { weight: 15, item: 'cookie' },
    { weight: 12, item: 'strawberry' },
    { weight: 10, item: 'warm_milk' },
    { weight: 8, item: 'blackberry' },
    { weight: 6, item: 'mushroom' },
    { weight: 5, item: 'coconut' },
    { weight: 4, item: 'ice_cream' },
  ] as readonly { weight: number; coins?: readonly [number, number]; item?: ItemId }[],
};

/** The pet has a present waiting for its owner (once per game day, with a strong bond). */
export function presentReady(state: PetState, t: number, rules: GameRules): boolean {
  if (state.status !== 'alive' || state.stage === 'egg' || state.stage === 'baby') return false;
  if (state.bond < PRESENT.minBond || state.outing || state.vacationSince != null) return false;
  if (t - state.bornAt < gameHours(rules, PRESENT.minAgeHours)) return false;
  return state.presentDay !== gameDay(rules, t);
}

/** What the present holds, from the server's dice (`random` returns numbers in [0, 1)). */
export function rollPresent(random: () => number): { coins: number; item: ItemId | null } {
  const total = PRESENT.table.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = random() * total;
  for (const entry of PRESENT.table) {
    roll -= entry.weight;
    if (roll >= 0) continue;
    if (entry.coins) {
      const [min, max] = entry.coins;
      return { coins: min + Math.floor(random() * (max - min + 1)), item: null };
    }
    return { coins: 0, item: entry.item ?? null };
  }
  return { coins: 5, item: null };
}
