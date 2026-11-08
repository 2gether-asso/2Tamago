import { describe, expect, it } from 'vitest';
import {
  createPet,
  EYES,
  PATTERNS,
  rollTraits,
  simulate,
  TEMPERAMENTS,
  traitsOf,
  withRules,
} from '../src/index.js';

const rules = withRules();
const T0 = Date.UTC(2026, 0, 1);

describe('traits', () => {
  it('rolls the same traits from the same seed', () => {
    expect(rollTraits(42)).toEqual(rollTraits(42));
  });

  it('only rolls known values and covers every temperament over many seeds', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 500; seed++) {
      const t = rollTraits(seed);
      expect(TEMPERAMENTS).toContain(t.temperament);
      expect(PATTERNS).toContain(t.pattern);
      expect(EYES).toContain(t.eyes);
      seen.add(t.temperament);
    }
    expect(seen.size).toBe(TEMPERAMENTS.length);
  });

  it('stores traits on a new pet, from the given seed', () => {
    const base = { name: 'Pompon', species: 'mochi', color: 10, now: T0 } as const;
    expect(createPet({ ...base, seed: 7 }, rules).traits).toEqual(rollTraits(7));
    expect(createPet(base, rules).traits).toEqual(createPet(base, rules).traits);
  });

  it('backfills traits on a pet that has none, without changing them afterwards', () => {
    const pet = createPet({ name: 'Vieux', species: 'kumo', color: 10, now: T0 }, rules);
    delete pet.traits;
    const first = simulate(pet, T0 + 1000, rules).state;
    expect(first.traits).toEqual(traitsOf(pet));
    expect(simulate(first, T0 + 2000, rules).state.traits).toEqual(first.traits);
  });
});
