import { describe, expect, it } from 'vitest';
import {
  applyAction,
  applyRulesOverrides,
  bedtimeOf,
  createPet,
  dayHour,
  gameHours,
  GameError,
  isNight,
  simulate,
  withRules,
  type PetState,
} from '../src/index.js';

const rules = withRules(); // night from 21h to 7h, clock offset 0
const DAY0 = Date.UTC(2026, 0, 1);
const at = (hour: number, day = 0) => DAY0 + (day * 24 + hour) * 3_600_000;

/** A baby hatched just before `hour`, so it is awake at `hour`. */
function hatchedAt(hour: number, r = rules): PetState {
  const egg = createPet(
    { name: 'Lune', species: 'mochi', color: 0, seed: 1, now: at(hour) - 7 * 60_000 },
    r,
  );
  return simulate(egg, at(hour), r).state;
}

describe('day and night', () => {
  it('follows the game clock, with an offset', () => {
    expect(dayHour(rules, at(13.5))).toBeCloseTo(13.5);
    expect(
      dayHour(withRules({ night: { ...rules.night, clockOffsetHours: 2 } }), at(23)),
    ).toBeCloseTo(1);
    expect(
      dayHour(withRules({ night: { ...rules.night, clockOffsetHours: -3 } }), at(1)),
    ).toBeCloseTo(22);
  });

  it('is night between the start and end hours, even across midnight', () => {
    expect(isNight(rules, at(12))).toBe(false);
    expect(isNight(rules, at(20.9))).toBe(false);
    expect(isNight(rules, at(21))).toBe(true);
    expect(isNight(rules, at(3))).toBe(true);
    expect(isNight(rules, at(6.9))).toBe(true);
    expect(isNight(rules, at(7))).toBe(false);
  });

  it('has no night when start and end are the same, and follows the time scale', () => {
    const never = withRules({ night: { ...rules.night, startHour: 5, endHour: 5 } });
    expect(isNight(never, at(2))).toBe(false);
    // At 24x a game day lasts one real hour: real hour 0 is game midnight, minute 30 is noon.
    const fast = withRules({ timeScale: 24 });
    expect(isNight(fast, DAY0 + 30 * 60_000)).toBe(false);
    expect(isNight(fast, DAY0 + 5 * 60_000)).toBe(true);
  });
});

describe('bedtime by stage', () => {
  it('gives each stage its own night, and the general night to the others', () => {
    expect(bedtimeOf(rules, 'baby')).toEqual({ startHour: 19, endHour: 8 });
    expect(bedtimeOf(rules, 'adult')).toEqual({ startHour: 22, endHour: 7 });
    expect(bedtimeOf(rules, 'egg')).toEqual({ startHour: 21, endHour: 7 });
    expect(bedtimeOf(rules)).toEqual({ startHour: 21, endHour: 7 });
  });

  it('puts babies to bed before adults, and wakes them later', () => {
    expect(isNight(rules, at(19.5), 'baby')).toBe(true);
    expect(isNight(rules, at(19.5), 'adult')).toBe(false);
    expect(isNight(rules, at(7.5), 'baby')).toBe(true);
    expect(isNight(rules, at(7.5), 'adult')).toBe(false);
    expect(isNight(rules, at(22.5), 'adult')).toBe(true);
  });

  it('only lets the lights go off at the bedtime of the pet stage', () => {
    const baby = hatchedAt(19.5);
    expect(baby.stage).toBe('baby');
    const off = applyAction(baby, { type: 'lights', on: false }, at(19.6), rules).state;
    expect(off.lightsOff).toBe(true);
    // The same hour is still day for an adult.
    const adult = { ...baby, stage: 'adult' as const };
    expect(() => applyAction(adult, { type: 'lights', on: false }, at(19.6), rules)).toThrow(
      GameError,
    );
  });

  it('makes a baby restless in the evening where an adult is not', () => {
    const lost = (stage: 'baby' | 'adult') => {
      const pet = { ...hatchedAt(19.2), stage };
      return pet.stats.happiness - simulate(pet, at(20.2), rules).state.stats.happiness;
    };
    expect(lost('baby')).toBeGreaterThan(0);
    // An adult needs less (stage neediness) and is not restless yet: the gap is more than the
    // difference in neediness alone.
    expect(lost('baby') / lost('adult')).toBeGreaterThan(1.5 / 0.9 + 0.5);
  });

  it('can be retuned for one stage without touching the others', () => {
    const tuned = applyRulesOverrides(rules, { night: { stages: { baby: { startHour: 18 } } } });
    expect(bedtimeOf(tuned, 'baby')).toEqual({ startHour: 18, endHour: 8 });
    expect(bedtimeOf(tuned, 'adult')).toEqual(bedtimeOf(rules, 'adult'));
  });
});

describe('lights', () => {
  it('can only be switched off at night', () => {
    const pet = hatchedAt(12);
    expect(() => applyAction(pet, { type: 'lights', on: false }, at(12), rules)).toThrow(GameError);
    const night = hatchedAt(22);
    const { state } = applyAction(night, { type: 'lights', on: false }, at(22.1), rules);
    expect(state.lightsOff).toBe(true);
  });

  it('puts the pet to sleep, keeps it asleep until morning, and the lights come back on', () => {
    const pet = hatchedAt(22);
    const off = applyAction(pet, { type: 'lights', on: false }, at(22.1), rules).state;

    const evening = simulate(off, at(23), rules).state;
    expect(evening.asleep).toBe(true);

    // Energy is full long before 3am, but it sleeps on.
    const deep = simulate(off, at(3, 1), rules).state;
    expect(deep.stats.energy).toBe(100);
    expect(deep.asleep).toBe(true);
    expect(deep.lightsOff).toBe(true);

    const { state: morning, events } = simulate(off, at(8.5, 1), rules);
    expect(morning.asleep).toBe(false);
    expect(morning.lightsOff).toBe(false);
    expect(events.map((e) => e.type)).toContain('woke_up');
  });

  it('makes a pet awake at night with the lights on restless', () => {
    const happiness = (hour: number) => {
      const pet = hatchedAt(hour);
      return pet.stats.happiness - simulate(pet, at(hour + 2), rules).state.stats.happiness;
    };
    expect(happiness(22)).toBeGreaterThan(happiness(10) * 1.4);
  });

  it('does not make a pet restless once the lights are off, or while it is out', () => {
    const pet = hatchedAt(22);
    const off = applyAction(pet, { type: 'lights', on: false }, at(22.05), rules).state;
    const lost = (p: PetState) =>
      pet.stats.happiness - simulate(p, at(23), rules).state.stats.happiness;
    expect(lost(off)).toBeLessThan(lost(pet));
  });

  it('waking the pet turns the lights back on', () => {
    const pet = hatchedAt(22);
    const off = applyAction(pet, { type: 'lights', on: false }, at(22.1), rules).state;
    const slept = simulate(off, at(23), rules).state;
    const woken = applyAction(slept, { type: 'wake' }, at(23.1), rules).state;
    expect(woken.lightsOff).toBe(false);
    expect(woken.asleep).toBe(false);
  });

  it('lets the owner turn the lights on again, by day or night', () => {
    const pet = hatchedAt(22);
    const off = applyAction(pet, { type: 'lights', on: false }, at(22.1), rules).state;
    const on = applyAction(off, { type: 'lights', on: true }, at(22.2), rules).state;
    expect(on.lightsOff).toBe(false);
  });

  it('treats a pet saved before this rule (no lightsOff) as having its lights on', () => {
    const pet = hatchedAt(12);
    expect('lightsOff' in pet).toBe(false);
    expect(simulate(pet, at(13), rules).state.asleep).toBe(false);
  });
});

describe('time helpers', () => {
  it('gameHours stays the unit of the day length', () => {
    expect(gameHours(rules, 24)).toBe(24 * 3_600_000);
  });
});
