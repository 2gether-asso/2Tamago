import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createPet,
  gameHours,
  isBedtime,
  isNight,
  simulate,
  withRules,
  type OwnerAction,
  type PetState,
} from '../src/index.js';

const rules = withRules();
const T0 = Date.UTC(2026, 0, 5, 7);
const h = (hours: number) => gameHours(rules, hours);

function hatched(): PetState {
  const egg = createPet({ name: 'Pompon', species: 'mochi', color: 120, now: T0, seed: 7 }, rules);
  return simulate(egg, T0 + h(0.2), rules).state;
}

function tryAct(pet: PetState, action: OwnerAction, at: number): PetState {
  try {
    return applyAction(pet, action, at, rules).state;
  } catch {
    return pet;
  }
}

/**
 * A casual owner: a few short visits a day, the same handful of taps each time. The balance
 * should reward regular short visits, not constant presence.
 */
function casualLife(
  hours: number[],
  days: number,
  { fillBowl = false, discipline = true, trainings = 1 } = {},
): PetState {
  let pet = hatched();
  const day0 = Math.floor(T0 / h(24)) * h(24);
  for (let d = 0; d < days; d++) {
    for (const hour of hours) {
      const t = day0 + h(24 * d + hour);
      pet = simulate(pet, t, rules).state;
      if (pet.asleep && !isNight(rules, t, pet.stage)) pet = tryAct(pet, { type: 'wake' }, t);
      if (discipline && pet.tantrumSince !== null) pet = tryAct(pet, { type: 'scold' }, t);
      for (let i = 0; i < 4 && pet.sickSince !== null; i++) {
        pet = tryAct(pet, { type: 'medicine' }, t);
      }
      pet = tryAct(pet, { type: 'clean' }, t);
      for (let i = 0; i < 4; i++) pet = tryAct(pet, { type: 'feed' }, t);
      if (fillBowl) pet = tryAct(pet, { type: 'fillBowl' }, t);
      pet = tryAct(pet, { type: 'play', score: 2 }, t);
      for (let i = 1; i <= 4; i++) pet = tryAct(pet, { type: 'caress' }, t + i * 20_000);
      for (let i = 0; discipline && i < trainings; i++) {
        pet = tryAct(pet, { type: 'train', trick: i % 2 ? 'spin' : 'sit' }, t + 100_000 + i);
      }
      if (isNight(rules, t, pet.stage)) pet = tryAct(pet, { type: 'lights', on: false }, t);
    }
  }
  return pet;
}

describe('balance for short, regular visits', () => {
  it('lets four short visits a day raise a radiant companion', () => {
    const pet = casualLife([8, 12.5, 19, 21.5], 7);
    expect(pet.stage).toBe('adult');
    expect(pet.form).toBe('radiant');
    expect(pet.careMistakes).toBe(0);
  });

  it('keeps two visits a day (bowl filled, a little training) out of the rascal branch', () => {
    const pet = casualLife([8, 19], 7, { fillBowl: true, trainings: 2 });
    expect(pet.stage).toBe('adult');
    expect(pet.form).not.toBe('rascal');
  });

  it('still turns a companion that is never trained nor scolded into a rascal', () => {
    const pet = casualLife([8, 12.5, 19, 21.5], 7, { discipline: false });
    expect(pet.stage).toBe('adult');
    expect(pet.form).toBe('rascal');
  });
});

describe('tantrums and discipline', () => {
  it('waits hours for an answer before counting a tantrum as ignored', () => {
    const pet = { ...hatched(), stage: 'child' as const, tantrumSince: null };
    pet.stats.discipline = 50;
    pet.nextTantrumAt = pet.simulatedAt + h(0.1);
    const calling = simulate(pet, pet.simulatedAt + h(2.5), rules).state;
    expect(calling.tantrumSince).not.toBeNull();
    const ignored = simulate(calling, calling.tantrumSince! + h(rules.tantrumWindowHours), rules);
    expect(ignored.events.map((e) => e.type)).toContain('attention_ignored');
    expect(ignored.state.stats.discipline).toBeCloseTo(
      50 - rules.tantrumIgnoredDiscipline - rules.disciplineDecayPerHour * 3.25,
      0,
    );
  });

  it('builds discipline through training', () => {
    const pet = { ...hatched(), stage: 'child' as const };
    pet.stats.discipline = 10;
    const trained = applyAction(pet, { type: 'train', trick: 'sit' }, pet.simulatedAt, rules);
    expect(trained.state.stats.discipline).toBe(10 + rules.trainDiscipline);
  });
});

describe('caresses', () => {
  it('strengthen the bond from the first caresses of the day only', () => {
    let pet = { ...hatched(), bond: 0 };
    let at = pet.simulatedAt;
    for (let i = 0; i < rules.caressBondPerDay + 5; i++) {
      at += rules.caressCooldownSeconds * 1000;
      pet = applyAction(pet, { type: 'caress' }, at, rules).state;
    }
    expect(pet.bond).toBe(rules.caressBondPerDay);
    // Still a cheer-up after the cap.
    pet.stats.happiness = 50;
    at += rules.caressCooldownSeconds * 1000;
    expect(applyAction(pet, { type: 'caress' }, at, rules).state.stats.happiness).toBe(53);
    // A new day, new hearts.
    const yesterday = { ...pet, affection: { day: pet.affection!.day - 1, count: 99 } };
    at += rules.caressCooldownSeconds * 1000;
    const today = applyAction(yesterday, { type: 'caress' }, at, rules).state;
    expect(today.bond).toBe(rules.caressBondPerDay + 1);
  });
});

describe('the bowl', () => {
  it('feeds the pet by itself when it gets hungry, one ration at a time', () => {
    let pet = hatched();
    pet.stats.satiety = 60;
    pet = applyAction(pet, { type: 'fillBowl' }, pet.simulatedAt, rules).state;
    expect(pet.bowl).toBe(rules.bowlCapacity);
    const later = simulate(pet, pet.simulatedAt + h(3), rules);
    const meals = later.events.filter((e) => e.type === 'ate_from_bowl');
    expect(meals).toHaveLength(1);
    expect(later.state.bowl).toBe(rules.bowlCapacity - 1);
    expect(later.state.stats.satiety).toBeGreaterThanOrEqual(rules.bowlHungerSatiety);
    // Without a bowl, the same pet would be hungry by now.
    const without = simulate({ ...pet, bowl: 0 }, pet.simulatedAt + h(3), rules).state;
    expect(without.stats.satiety).toBeLessThan(rules.bowlHungerSatiety);
  });

  it('refuses to be filled when full, and waits while the pet sleeps', () => {
    let pet = hatched();
    pet = applyAction(pet, { type: 'fillBowl' }, pet.simulatedAt, rules).state;
    expect(() => applyAction(pet, { type: 'fillBowl' }, pet.simulatedAt, rules)).toThrowError(
      expect.objectContaining({ code: 'bowl_full' }),
    );
    const asleep = { ...pet, asleep: true, lightsOff: true };
    asleep.stats.satiety = 20;
    const next = simulate(asleep, pet.simulatedAt + h(0.5), rules).state;
    expect(next.bowl).toBe(rules.bowlCapacity);
  });
});

describe('tucking in early', () => {
  it('lets the lights go off a few hours before bedtime, and the pet sleeps until morning', () => {
    const day0 = Math.floor(T0 / h(24)) * h(24);
    const pet = { ...hatched(), stage: 'adult' as const };
    pet.stats.energy = 100;
    const bedtime = rules.night.stages.adult!.startHour;
    const tooEarly = day0 + h(bedtime - rules.night.tuckInHours - 1);
    expect(isBedtime(rules, tooEarly, 'adult')).toBe(false);
    expect(() =>
      applyAction(
        simulate(pet, tooEarly, rules).state,
        { type: 'lights', on: false },
        tooEarly,
        rules,
      ),
    ).toThrowError(expect.objectContaining({ code: 'not_night' }));

    const early = day0 + h(bedtime - 2);
    const tucked = applyAction(
      simulate(pet, early, rules).state,
      { type: 'lights', on: false },
      early,
      rules,
    ).state;
    const night = simulate(tucked, day0 + h(bedtime + 4), rules).state;
    expect(night.asleep).toBe(true);
    expect(night.lightsOff).toBe(true);
    const morning = simulate(night, day0 + h(24 + rules.night.stages.adult!.endHour + 1), rules);
    expect(morning.state.asleep).toBe(false);
    expect(morning.state.lightsOff).toBe(false);
  });
});
