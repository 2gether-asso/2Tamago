import { createPet, gameHours, simulate, withRules, type PetState } from '@2tamago/core';
import { pushKindsOf } from './push-alerts.js';

const rules = withRules();
const T0 = Date.UTC(2026, 10, 1, 12);
const NOW = T0 + 3_600_000;

/** A hatched, awake, well-fed companion, with the given changes. */
function pet(overrides: Partial<PetState> = {}, stats: Partial<PetState['stats']> = {}): PetState {
  const egg = createPet({ name: 'P', species: 'mochi', color: 0, seed: 1, now: T0 }, rules);
  const state = simulate(egg, T0 + gameHours(rules, 0.2), rules).state;
  return {
    ...state,
    asleep: false,
    stats: { ...state.stats, satiety: 80, happiness: 80, energy: 80, hygiene: 80, ...stats },
    ...overrides,
  };
}

describe('pushKindsOf', () => {
  it('has nothing to say about a pet that is fine', () => {
    expect(pushKindsOf(pet(), NOW)).toEqual([]);
  });

  it('reports hunger, sickness and tantrums, the most pressing first', () => {
    expect(pushKindsOf(pet({}, { satiety: 10 }), NOW)).toEqual(['hungry']);
    expect(pushKindsOf(pet({ sickSince: T0 }), NOW)).toEqual(['sick']);
    expect(pushKindsOf(pet({ tantrumSince: T0 }), NOW)).toEqual(['calling']);
    expect(pushKindsOf(pet({ sickSince: T0, tantrumSince: T0 }, { satiety: 10 }), NOW)).toEqual([
      'sick',
      'calling',
      'hungry',
    ]);
  });

  it('leaves the minor needs for the next visit', () => {
    expect(pushKindsOf(pet({ poops: 3 }, { happiness: 5, hygiene: 5, energy: 5 }), NOW)).toEqual(
      [],
    );
  });

  it('never wakes the owner for a sleeping pet', () => {
    expect(pushKindsOf(pet({ asleep: true, sickSince: T0 }, { satiety: 5 }), NOW)).toEqual([]);
  });

  it('tells when a walk is over, not before', () => {
    const outing = { startedAt: T0, endsAt: NOW };
    expect(pushKindsOf(pet({ outing }), NOW - 1)).toEqual([]);
    expect(pushKindsOf(pet({ outing }), NOW)).toEqual(['walk_done']);
    // Whatever else is wrong, the walk comes first: the owner has to bring the pet back.
    expect(pushKindsOf(pet({ outing }, { satiety: 5 }), NOW)).toEqual(['walk_done']);
  });

  it('ignores eggs and pets that are gone', () => {
    expect(pushKindsOf(pet({ stage: 'egg' }, { satiety: 0 }), NOW)).toEqual([]);
    expect(pushKindsOf(pet({ status: 'gone' }, { satiety: 0 }), NOW)).toEqual([]);
    expect(pushKindsOf(pet({ status: 'retired' }, { satiety: 0 }), NOW)).toEqual([]);
  });
});
