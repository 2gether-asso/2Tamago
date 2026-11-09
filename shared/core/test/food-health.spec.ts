import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createPet,
  dietOf,
  GameError,
  gameHours,
  ITEMS,
  simulate,
  withRules,
  type FoodGroup,
  type PetState,
} from '../src/index.js';
import { ownerActionBody } from '../src/contracts/index.js';

const rules = withRules();
const T0 = Date.UTC(2026, 0, 1);
const h = (hours: number) => gameHours(rules, hours);

function hatched(): PetState {
  const egg = createPet({ name: 'Pompon', species: 'mochi', color: 120, now: T0 }, rules);
  const pet = simulate(egg, T0 + h(0.2), rules).state;
  return { ...pet, asleep: false };
}

const hungry = (): PetState => {
  const pet = hatched();
  return { ...pet, stats: { ...pet.stats, satiety: 20 } };
};
const sick = (illness: PetState['illness']): PetState => ({
  ...hatched(),
  sickSince: T0,
  illness,
});

describe('feeding', () => {
  it('gives a free ration that is smaller than a meal', () => {
    const pet = hungry();
    const now = pet.simulatedAt;
    const free = applyAction(pet, { type: 'feed' }, now, rules).state;
    const meal = applyAction(pet, { type: 'feed', item: 'grilled_fish' }, now, rules).state;
    expect(free.stats.satiety).toBe(20 + rules.freeMealSatiety);
    expect(meal.stats.satiety).toBe(20 + ITEMS.grilled_fish.satiety);
    expect(meal.stats.satiety).toBeGreaterThan(free.stats.satiety);
    // The free ration is not a food group: it does not count in the diet.
    expect(free.diet ?? []).toEqual([]);
    expect(meal.diet).toEqual(['protein']);
  });

  it('only accepts a meal as food', () => {
    const pet = hungry();
    for (const item of ['cookie', 'syrup', 'hat'] as const) {
      expect(() => applyAction(pet, { type: 'feed', item }, pet.simulatedAt, rules)).toThrow(
        GameError,
      );
    }
  });

  it('refuses a meal when the pet is full', () => {
    const pet = hatched();
    const full = { ...pet, stats: { ...pet.stats, satiety: rules.fullSatiety } };
    expect(() =>
      applyAction(full, { type: 'feed', item: 'rice_bowl' }, pet.simulatedAt, rules),
    ).toThrowError(/not_hungry|faim/);
  });

  it('makes a full pet fatter when it is stuffed with treats', () => {
    const pet = hatched();
    const now = pet.simulatedAt;
    const full = { ...pet, stats: { ...pet.stats, satiety: 90 } };
    const hungryPet = { ...pet, stats: { ...pet.stats, satiety: 20 } };
    const stuffed = applyAction(full, { type: 'treat', item: 'cookie' }, now, rules).state;
    const normal = applyAction(hungryPet, { type: 'treat', item: 'cookie' }, now, rules).state;
    expect(stuffed.weight - full.weight).toBe(normal.weight - hungryPet.weight + 2);
  });

  it('accepts the new items in requests', () => {
    expect(ownerActionBody.safeParse({ type: 'feed', item: 'rice_bowl' }).success).toBe(true);
    expect(ownerActionBody.safeParse({ type: 'medicine', item: 'syrup' }).success).toBe(true);
    expect(ownerActionBody.safeParse({ type: 'feed' }).success).toBe(true);
  });
});

describe('balanced diet', () => {
  const diet = (...groups: FoodGroup[]) => dietOf({ diet: groups }, rules);

  it('is neutral without enough history', () => {
    expect(diet()).toBe('neutral');
    expect(diet('sweet', 'sweet')).toBe('neutral');
  });

  it('is balanced with three healthy groups and few sweets', () => {
    expect(diet('grain', 'veg', 'protein')).toBe('balanced');
    expect(diet('grain', 'veg', 'fruit', 'sweet', 'grain')).toBe('balanced');
    expect(diet('grain', 'grain', 'grain')).toBe('neutral');
  });

  it('is unbalanced when mostly sweets', () => {
    expect(diet('sweet', 'sweet', 'sweet', 'grain')).toBe('unbalanced');
    expect(diet('sweet', 'sweet', 'veg', 'fruit', 'protein', 'sweet')).toBe('neutral');
  });

  it('only remembers the latest meals', () => {
    let pet = hatched();
    for (const item of [
      'rice_bowl',
      'veggie_stew',
      'grilled_fish',
      'fruit_salad',
      'rice_bowl',
      'veggie_stew',
      'grilled_fish',
    ] as const) {
      pet = {
        ...pet,
        stats: { ...pet.stats, satiety: 0 },
      };
      pet = applyAction(pet, { type: 'feed', item }, pet.simulatedAt, rules).state;
    }
    expect(pet.diet).toHaveLength(rules.dietWindow);
    expect(dietOf(pet, rules)).toBe('balanced');
  });

  it('heals faster when balanced', () => {
    const base = hatched();
    const hurt = { ...base, stats: { ...base.stats, health: 50, satiety: 100, happiness: 100 } };
    const end = hurt.simulatedAt + h(1);
    const plain = simulate(hurt, end, rules).state.stats.health;
    const balanced = simulate({ ...hurt, diet: ['grain', 'veg', 'protein'] }, end, rules).state
      .stats.health;
    expect(balanced).toBeGreaterThan(plain);
  });

  it('adds a sickness factor when unbalanced', () => {
    const base = hatched();
    const pet = { ...base, stats: { ...base.stats, satiety: 100 } };
    const end = pet.simulatedAt + h(1);
    expect(simulate(pet, end, rules).state.sicknessPressure).toBe(0);
    const sweet = simulate({ ...pet, diet: ['sweet', 'sweet', 'sweet', 'sweet'] }, end, rules);
    expect(sweet.state.sicknessPressure).toBeGreaterThan(0);
  });
});

describe('illnesses', () => {
  const fallIll = (pet: PetState) => simulate(pet, pet.simulatedAt + h(6), rules);

  it('catches an infection when dirty', () => {
    const base = hatched();
    const dirty = { ...base, poops: 4, stats: { ...base.stats, satiety: 100, hygiene: 0 } };
    const { state, events } = fallIll(dirty);
    expect(state.illness).toBe('infection');
    expect(events.find((e) => e.type === 'fell_ill')?.data).toEqual({ illness: 'infection' });
  });

  it('catches weakness when starving', () => {
    const base = hatched();
    const starving = { ...base, stats: { ...base.stats, satiety: 0 }, nextPoopAt: Infinity };
    expect(fallIll(starving).state.illness).toBe('weakness');
  });

  it('catches indigestion from a diet of sweets', () => {
    const base = hatched();
    const pet = {
      ...base,
      weight: 60,
      diet: ['sweet', 'sweet', 'sweet', 'sweet'] as FoodGroup[],
      stats: { ...base.stats, satiety: 100 },
    };
    expect(fallIll(pet).state.illness).toBe('indigestion');
  });

  it('is cured at once by its own medicine', () => {
    const pet = sick('infection');
    const result = applyAction(
      pet,
      { type: 'medicine', item: 'antibiotic' },
      pet.simulatedAt,
      rules,
    );
    expect(result.state.sickSince).toBeNull();
    expect(result.state.illness).toBeNull();
    expect(result.events.find((e) => e.type === 'cured')?.data).toEqual({ illness: 'infection' });
  });

  it('is not cured by the medicine of another illness, which only counts for a part', () => {
    const pet = sick('infection');
    const { state } = applyAction(
      pet,
      { type: 'medicine', item: 'vitamins' },
      pet.simulatedAt,
      rules,
    );
    expect(state.sickSince).not.toBeNull();
    expect(state.medicineDoses).toBe(rules.wrongMedicineDose);
  });

  it('is cured by two syrups, whatever the illness', () => {
    let pet = sick('indigestion');
    pet = applyAction(pet, { type: 'medicine', item: 'syrup' }, pet.simulatedAt, rules).state;
    expect(pet.sickSince).not.toBeNull();
    pet = applyAction(pet, { type: 'medicine', item: 'syrup' }, pet.simulatedAt, rules).state;
    expect(pet.sickSince).toBeNull();
  });

  it('can still be cured for free, but slowly', () => {
    let pet = sick('weakness');
    let doses = 0;
    while (pet.sickSince !== null && doses < 20) {
      pet = applyAction(pet, { type: 'medicine' }, pet.simulatedAt, rules).state;
      doses++;
    }
    expect(doses).toBe(Math.ceil(rules.medicineDoses / rules.freeMedicineDose));
  });

  it('refuses a medicine for a healthy pet and food as a medicine', () => {
    const pet = hatched();
    expect(() =>
      applyAction(pet, { type: 'medicine', item: 'syrup' }, pet.simulatedAt, rules),
    ).toThrow(GameError);
    expect(() =>
      applyAction(sick('infection'), { type: 'medicine', item: 'rice_bowl' }, T0 + h(0.2), rules),
    ).toThrow(GameError);
  });
});
