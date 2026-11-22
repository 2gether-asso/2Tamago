import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createPet,
  gameHours,
  grantsWish,
  pickWish,
  simulate,
  WISH,
  WISH_IDS,
  withRules,
  type PetState,
  type WishId,
} from '../src/index.js';

const rules = withRules();
const T0 = Date.UTC(2026, 0, 5, 9);
const h = (hours: number) => gameHours(rules, hours);

function hatched(): PetState {
  const egg = createPet({ name: 'Pompon', species: 'mochi', color: 120, now: T0, seed: 3 }, rules);
  return simulate(egg, T0 + h(0.2), rules).state;
}

/** A child with a given wish, made just now. */
function wishing(id: WishId, item?: 'cookie' | 'strawberry'): PetState {
  const pet = { ...hatched(), stage: 'child' as const };
  pet.stats.happiness = 50;
  pet.stats.energy = 80;
  pet.stats.satiety = 50;
  pet.wish = { id, item, since: pet.simulatedAt, until: pet.simulatedAt + h(WISH.hours) };
  return pet;
}

describe('wishes', () => {
  it('come soon after hatching, then fade without any penalty', () => {
    const pet = hatched();
    const later = simulate(pet, pet.simulatedAt + h(WISH.firstAfterHatchHours + 0.1), rules);
    expect(later.state.wish).toBeTruthy();
    expect(later.events.map((e) => e.type)).toContain('wish_made');

    const wish = later.state.wish!;
    const faded = simulate(later.state, wish.until + h(0.1), rules);
    expect(faded.state.wish ?? null).toBeNull();
    expect(faded.events.map((e) => e.type)).toContain('wish_faded');
    expect(faded.state.careMistakes).toBe(pet.careMistakes);
    expect(faded.state.wishTally).toEqual({ granted: 0, faded: 1 });
  });

  it('are granted by the matching action: happiness, bond, and the next one later', () => {
    const pet = wishing('play');
    const at = pet.simulatedAt;
    const result = applyAction(pet, { type: 'play', score: 0 }, at, rules);
    expect(result.events.map((e) => e.type)).toContain('wish_granted');
    expect(result.state.wish).toBeNull();
    // The same game without the wish.
    const plain = applyAction({ ...pet, wish: null }, { type: 'play', score: 0 }, at, rules).state;
    expect(result.state.stats.happiness).toBe(plain.stats.happiness + WISH.happiness);
    expect(result.state.bond).toBe(plain.bond + WISH.bond);
    expect(result.state.nextWishAt).toBe(at + h(WISH.intervalHours));
    expect(result.state.wishTally).toEqual({ granted: 1, faded: 0 });
  });

  it('want the very treat they asked for, and a real meal rather than the free ration', () => {
    const treat = wishing('treat', 'strawberry');
    const at = treat.simulatedAt;
    const wrong = applyAction(treat, { type: 'treat', item: 'cookie' }, at, rules);
    expect(wrong.state.wish?.id).toBe('treat');
    const right = applyAction(treat, { type: 'treat', item: 'strawberry' }, at, rules);
    expect(right.state.wish).toBeNull();

    const meal = wishing('meal');
    expect(applyAction(meal, { type: 'feed' }, at, rules).state.wish?.id).toBe('meal');
    expect(applyAction(meal, { type: 'feed', item: 'rice_bowl' }, at, rules).state.wish).toBeNull();
  });

  it('are not granted by a caress on cooldown, nor by a visitor', () => {
    const pet = { ...wishing('caress'), lastCaressAt: T0 };
    const at = pet.simulatedAt;
    pet.lastCaressAt = at - 1000;
    expect(applyAction(pet, { type: 'caress' }, at, rules).state.wish?.id).toBe('caress');
    expect(applyAction(pet, { type: 'visitorCaress' }, at, rules).state.wish?.id).toBe('caress');
  });

  it('match their actions', () => {
    expect(grantsWish({ id: 'walk' }, { type: 'startOuting' })).toBe(true);
    expect(grantsWish({ id: 'bath' }, { type: 'clean' })).toBe(true);
    expect(grantsWish({ id: 'praise' }, { type: 'scold' })).toBe(false);
  });

  it('follow the temperament, never repeat, and keep babies off walks and training', () => {
    const tidy = { ...hatched(), stage: 'adult' as const };
    tidy.traits = { ...tidy.traits!, temperament: 'tidy' };
    const counts = Object.fromEntries(WISH_IDS.map((id) => [id, 0])) as Record<WishId, number>;
    for (let i = 0; i < 2000; i++) counts[pickWish(tidy, T0 + i * 1000).id]++;
    expect(counts.bath).toBe(Math.max(...Object.values(counts)));

    for (let i = 0; i < 200; i++) expect(pickWish(tidy, T0 + i, 'bath').id).not.toBe('bath');

    const baby = hatched();
    for (let i = 0; i < 500; i++) {
      expect(['walk', 'train']).not.toContain(pickWish(baby, T0 + i * 1000).id);
    }
  });

  it('keep their timing through a vacation', () => {
    const pet = wishing('bath');
    const left = applyAction(pet, { type: 'startVacation' }, pet.simulatedAt, rules).state;
    const back = applyAction(left, { type: 'endVacation' }, pet.simulatedAt + h(48), rules).state;
    expect(back.wish?.until).toBe(pet.wish!.until + h(48));
  });
});
