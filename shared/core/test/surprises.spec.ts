import { describe, expect, it } from 'vitest';
import {
  applyAction,
  BIRTHDAY,
  BIRTHDAY_EVERY_DAYS,
  createPet,
  DAY_THEMES,
  dayThemeAt,
  gameDay,
  gameHours,
  isBirthday,
  PRESENT,
  presentReady,
  rollPresent,
  simulate,
  THEMED_DAYS_PERCENT,
  withRules,
  type DayTheme,
  type PetState,
} from '../src/index.js';

const rules = withRules();
const T0 = Date.UTC(2026, 0, 5, 9);
const h = (hours: number) => gameHours(rules, hours);

function adult(): PetState {
  const egg = createPet({ name: 'Pompon', species: 'mochi', color: 120, now: T0, seed: 3 }, rules);
  const pet = { ...simulate(egg, T0 + h(0.2), rules).state, stage: 'adult' as const };
  pet.stats = { ...pet.stats, happiness: 40, energy: 80, satiety: 40 };
  return pet;
}

/** The first day from T0 with `theme`, as a time in the middle of that day. */
function dayWith(theme: DayTheme | null): number {
  for (let d = 0; d < 400; d++) {
    const t = T0 + h(24 * d);
    if (dayThemeAt(rules, t) === theme) return t;
  }
  throw new Error(`no ${theme} day`);
}

describe('themed days', () => {
  it('are the same all day, for everyone, and come around regularly', () => {
    const seen = new Map<DayTheme | null, number>();
    for (let d = 0; d < 1000; d++) {
      const theme = dayThemeAt(rules, T0 + h(24 * d));
      seen.set(theme, (seen.get(theme) ?? 0) + 1);
    }
    const themed = 1000 - (seen.get(null) ?? 0);
    expect(themed).toBeGreaterThan(THEMED_DAYS_PERCENT * 10 - 80);
    expect(themed).toBeLessThan(THEMED_DAYS_PERCENT * 10 + 80);
    for (const theme of DAY_THEMES) expect(seen.get(theme)).toBeGreaterThan(40);
  });

  it('make games happier on a festival, and baths fun on a bubble day', () => {
    const ordinary = dayWith(null);
    const festival = dayWith('festival');
    const play = (t: number) => {
      const pet = { ...adult(), simulatedAt: t - (t % h(1 / 12)) };
      return applyAction(pet, { type: 'play', score: 2 }, t, rules).state.stats.happiness;
    };
    expect(play(festival) - 40).toBeGreaterThan(play(ordinary) - 40);

    const bubbles = dayWith('bubbles');
    const pet = { ...adult(), simulatedAt: bubbles - (bubbles % h(1 / 12)) };
    const clean = applyAction(pet, { type: 'clean' }, bubbles, rules).state;
    expect(clean.stats.happiness).toBeGreaterThan(pet.stats.happiness);
  });
});

describe('birthdays', () => {
  it('come every week of life, and the party is thrown once', () => {
    const pet = adult();
    const birthday = pet.bornAt + h(24 * BIRTHDAY_EVERY_DAYS + 1);
    const ready = { ...pet, simulatedAt: birthday - (birthday % h(1 / 12)) };
    expect(isBirthday(ready, birthday, rules)).toBe(true);
    expect(isBirthday(ready, birthday + h(24), rules)).toBe(false);

    const party = applyAction(ready, { type: 'celebrate' }, birthday, rules);
    expect(party.events.map((e) => e.type)).toContain('birthday');
    expect(party.state.bond).toBe(ready.bond + BIRTHDAY.bond);
    expect(() => applyAction(party.state, { type: 'celebrate' }, birthday + 1000, rules)).toThrow(
      expect.objectContaining({ code: 'not_birthday' }),
    );
    expect(() => applyAction(ready, { type: 'celebrate' }, birthday + h(24), rules)).toThrow(
      expect.objectContaining({ code: 'not_birthday' }),
    );
  });
});

describe('presents', () => {
  it('wait for a strong bond, and come once a game day', () => {
    const t = T0 + h(30);
    const shy = { ...adult(), bond: PRESENT.minBond - 1 };
    expect(presentReady(shy, t, rules)).toBe(false);
    const fond = { ...adult(), bond: PRESENT.minBond, simulatedAt: t - (t % h(1 / 12)) };
    expect(presentReady(fond, t, rules)).toBe(true);
    const taken = applyAction(fond, { type: 'takePresent' }, t, rules).state;
    expect(taken.presentDay).toBe(gameDay(rules, t));
    expect(presentReady(taken, t + 1000, rules)).toBe(false);
    expect(() => applyAction(taken, { type: 'takePresent' }, t + 1000, rules)).toThrow(
      expect.objectContaining({ code: 'no_present' }),
    );
    expect(presentReady(taken, t + h(24), rules)).toBe(true);
  });

  it('hold coins or an item from the table', () => {
    expect(rollPresent(() => 0)).toEqual({ coins: 5, item: null });
    const last = rollPresent(() => 0.9999);
    expect(last.item).toBe(PRESENT.table.at(-1)!.item);
  });
});
