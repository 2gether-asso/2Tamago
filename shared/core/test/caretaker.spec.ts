import { describe, expect, it } from 'vitest';
import {
  applyAction,
  CARETAKER_ACTION_TYPES,
  createPet,
  gameHours,
  simulate,
  withRules,
} from '../src/index.js';
import { careActionBody, ownerActionBody } from '../src/contracts/index.js';

const rules = withRules();
const T0 = Date.UTC(2026, 0, 1);

describe('caretaker actions', () => {
  it('are exactly the ones the contract accepts', () => {
    const accepted = careActionBody.options.map((option) => option.shape.type.value).sort();
    expect(accepted).toEqual([...CARETAKER_ACTION_TYPES].sort());
  });

  it('are all owner actions too, and the engine applies them the same way', () => {
    const egg = createPet({ name: 'Pompon', species: 'mochi', color: 120, now: T0 }, rules);
    const baby = simulate(egg, T0 + gameHours(rules, 6), rules).state;
    for (const type of CARETAKER_ACTION_TYPES) {
      const body = type === 'lights' ? { type, on: true } : { type };
      expect(ownerActionBody.safeParse(body).success, type).toBe(true);
      expect(careActionBody.safeParse(body).success, type).toBe(true);
    }
    // The care does what the owner's does: a hungry baby is fed.
    const hungry = { ...baby, stats: { ...baby.stats, satiety: 10 }, asleep: false };
    const fed = applyAction(hungry, { type: 'feed' }, baby.simulatedAt, rules).state;
    expect(fed.stats.satiety).toBe(10 + rules.freeMealSatiety);
  });

  it('leave the owner’s own choices to the owner', () => {
    for (const body of [
      { type: 'train', trick: 'sit' },
      { type: 'play', score: 3 },
      { type: 'treat', item: 'cookie' },
      { type: 'equip', item: 'hat' },
      { type: 'retire' },
      { type: 'startVacation' },
      { type: 'endVacation' },
    ]) {
      expect(ownerActionBody.safeParse(body).success, body.type).toBe(true);
      expect(careActionBody.safeParse(body).success, body.type).toBe(false);
    }
  });
});
