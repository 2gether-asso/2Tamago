import { describe, expect, it } from 'vitest';
import { rulesOverridesBody } from '../src/contracts/index.js';
import {
  applyAction,
  applyRulesOverrides,
  createPet,
  gameHours,
  MOD_BETTER,
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

  it('backfills traits on a hatched pet that has none, without changing them afterwards', () => {
    const egg = createPet({ name: 'Vieux', species: 'kumo', color: 10, now: T0 }, rules);
    const pet = simulate(egg, T0 + gameHours(rules, 0.2), rules).state;
    delete pet.traits;
    const first = simulate(pet, pet.simulatedAt + 1000, rules).state;
    expect(first.traits).toEqual(traitsOf(pet));
    expect(simulate(first, first.simulatedAt + 1000, rules).state.traits).toEqual(first.traits);
  });

  it('leaves an egg without traits alone (they are hidden until hatching)', () => {
    const egg = createPet({ name: 'Secret', species: 'mochi', color: 10, now: T0 }, rules);
    delete egg.traits;
    expect(simulate(egg, T0 + 1000, rules).state.traits).toBeUndefined();
  });
});

describe('temperaments', () => {
  const keys = Object.keys(MOD_BETTER) as (keyof typeof MOD_BETTER)[];

  for (const temperament of TEMPERAMENTS) {
    it(`${temperament} has at least one pro and one con, within bounds`, () => {
      const mods = rules.temperaments[temperament];
      let pros = 0;
      let cons = 0;
      for (const key of keys) {
        const value = mods[key] ?? 1;
        expect(value).toBeGreaterThanOrEqual(0.7);
        expect(value).toBeLessThanOrEqual(1.5);
        if (value === 1) continue;
        const good = MOD_BETTER[key] === 'higher' ? value > 1 : value < 1;
        if (good) pros++;
        else cons++;
      }
      expect(pros).toBeGreaterThanOrEqual(1);
      expect(cons).toBeGreaterThanOrEqual(1);
    });
  }

  function petWith(temperament: (typeof TEMPERAMENTS)[number]) {
    const egg = createPet({ name: 'Test', species: 'mochi', color: 0, now: T0 }, rules);
    egg.traits = { temperament, pattern: 'plain', eyes: 'round' };
    return simulate(egg, T0 + gameHours(rules, 0.2), rules).state;
  }
  const stats = (temperament: (typeof TEMPERAMENTS)[number]) =>
    simulate(petWith(temperament), T0 + gameHours(rules, 3), rules).state.stats;

  it('a greedy pet gets hungry faster but stays happier than a baseline', () => {
    const greedy = stats('greedy');
    const tidy = stats('tidy');
    expect(greedy.satiety).toBeLessThan(tidy.satiety);
    expect(greedy.happiness).toBeGreaterThan(tidy.happiness);
  });

  it('a tidy pet keeps its hygiene better but tires faster', () => {
    const tidy = stats('tidy');
    const greedy = stats('greedy');
    expect(tidy.hygiene).toBeGreaterThan(greedy.hygiene);
    expect(tidy.energy).toBeLessThan(greedy.energy);
  });

  it('a cuddly pet bonds more per caress', () => {
    const caress = (temperament: (typeof TEMPERAMENTS)[number]) =>
      applyAction(petWith(temperament), { type: 'caress' }, T0 + gameHours(rules, 0.3), rules).state
        .bond;
    expect(caress('cuddly')).toBeGreaterThan(caress('sturdy'));
  });
});

describe('temperament tuning', () => {
  it('lets an admin retune one temperament without touching the others', () => {
    const tuned = applyRulesOverrides(rules, {
      temperaments: { greedy: { satietyDecay: 2 } },
    });
    expect(tuned.temperaments.greedy).toEqual({ satietyDecay: 2 });
    expect(tuned.temperaments.sleepy).toEqual(rules.temperaments.sleepy);

    const decayed = (r: typeof rules) => {
      const egg = createPet({ name: 'T', species: 'mochi', color: 0, now: T0 }, r);
      egg.traits = { temperament: 'greedy', pattern: 'plain', eyes: 'round' };
      const baby = simulate(egg, T0 + gameHours(r, 0.2), r).state;
      return simulate(baby, T0 + gameHours(r, 3), r).state.stats.satiety;
    };
    expect(decayed(tuned)).toBeLessThan(decayed(rules));
  });

  it('validates admin tunings: known temperaments and keys, bounded multipliers', () => {
    const ok = rulesOverridesBody.safeParse({ temperaments: { cuddly: { caressBond: 1.2 } } });
    expect(ok.success).toBe(true);
    for (const bad of [
      { temperaments: { nope: { caressBond: 1.2 } } },
      { temperaments: { cuddly: { nope: 1.2 } } },
      { temperaments: { cuddly: { caressBond: 5 } } },
      { temperaments: { cuddly: { caressBond: 0 } } },
    ]) {
      expect(rulesOverridesBody.safeParse(bad).success).toBe(false);
    }
  });
});
