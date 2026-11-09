import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createPet,
  gameHours,
  GameError,
  petAbility,
  petWage,
  playerWage,
  simulate,
  WORK,
  workLuck,
  withRules,
  type PetState,
  type Stage,
} from '../src/index.js';

const rules = withRules();
const T0 = Date.UTC(2026, 0, 1);

function pet(stage: Stage = 'adult', overrides: Partial<PetState> = {}): PetState {
  const egg = createPet({ name: 'Pompon', species: 'mochi', color: 120, now: T0 }, rules);
  const hatched = simulate(egg, T0 + gameHours(rules, 0.2), rules).state;
  return { ...hatched, stage, ...overrides };
}
const at = T0 + gameHours(rules, 0.2);

describe('playerWage', () => {
  it('pays per right answer, within the rounds', () => {
    expect(playerWage(0)).toBe(0);
    expect(playerWage(3)).toBe(3 * WORK.coinsPerPoint);
    expect(playerWage(99)).toBe(WORK.rounds * WORK.coinsPerPoint);
    expect(playerWage(-4)).toBe(0);
  });
});

describe('petAbility', () => {
  it('stays between 0 and 1 and grows with what the pet has learned', () => {
    const dull = pet('adult');
    const trained = pet('adult', {
      tricks: { sit: 100, spin: 100, jump: 100, highfive: 100 },
      bond: 100,
      stats: { ...dull.stats, discipline: 100, happiness: 100 },
    });
    expect(petAbility(dull)).toBeGreaterThanOrEqual(0);
    expect(petAbility(trained)).toBeLessThanOrEqual(1);
    expect(petAbility(trained)).toBeGreaterThan(petAbility(dull));
  });

  it('is lower for a child than for an adult with the same skills', () => {
    const skills = { tricks: { sit: 100, spin: 100, jump: 100, highfive: 100 } };
    expect(petAbility(pet('child', skills))).toBeLessThan(petAbility(pet('adult', skills)));
  });
});

describe('petWage', () => {
  it('is deterministic: same pet, same seed, same wage', () => {
    expect(petWage(pet(), 42)).toBe(petWage(pet(), 42));
    expect(workLuck(42)).toBe(workLuck(42));
  });

  it('depends on the seed, within the luck range, and pays at least a coin', () => {
    const state = pet();
    const wages = new Set<number>();
    for (let seed = 0; seed < 200; seed++) {
      const wage = petWage(state, seed);
      wages.add(wage);
      expect(wage).toBeGreaterThanOrEqual(1);
      expect(wage).toBeLessThanOrEqual(Math.round(WORK.petBaseMax * (1 + WORK.luckSpread)));
    }
    expect(wages.size).toBeGreaterThan(1);
  });

  it('pays a skilled pet more on average', () => {
    const skilled = pet('adult', {
      tricks: { sit: 100, spin: 100, jump: 100, highfive: 100 },
      bond: 100,
    });
    const mean = (state: PetState) => {
      let total = 0;
      for (let seed = 0; seed < 300; seed++) total += petWage(state, seed);
      return total / 300;
    };
    expect(mean(skilled)).toBeGreaterThan(mean(pet('adult')));
  });
});

describe('work action', () => {
  it('tires the pet', () => {
    const before = pet();
    const { state } = applyAction(before, { type: 'work' }, at, rules);
    expect(state.stats.energy).toBeLessThan(before.stats.energy);
    expect(state.stats.satiety).toBeLessThan(before.stats.satiety);
  });

  it('refuses a baby, a tired or a hungry pet', () => {
    const code = (state: PetState) => {
      try {
        applyAction(state, { type: 'work' }, at, rules);
      } catch (e) {
        return (e as GameError).code;
      }
      return null;
    };
    expect(code(pet('baby'))).toBe('too_young');
    const base = pet();
    expect(code({ ...base, stats: { ...base.stats, energy: 10 } })).toBe('too_tired');
    expect(code({ ...base, stats: { ...base.stats, satiety: 10 } })).toBe('too_hungry');
  });
});
