import { describe, expect, it } from 'vitest';
import {
  applyAction,
  CRITICAL_HEALTH,
  createPet,
  gameHours,
  GameError,
  isCritical,
  simulate,
  withRules,
} from '../src/index.js';

const rules = withRules();
const T0 = Date.UTC(2026, 0, 1);

function sickPet(health: number) {
  const egg = createPet({ name: 'Pompon', species: 'mochi', color: 120, now: T0 }, rules);
  const baby = simulate(egg, T0 + gameHours(rules, 6), rules).state;
  return {
    ...baby,
    asleep: false,
    sickSince: baby.simulatedAt,
    illness: 'infection' as const,
    stats: { ...baby.stats, health },
  };
}

describe('visitor medicine', () => {
  it('only counts a sick pet with low health as critical', () => {
    expect(isCritical(sickPet(CRITICAL_HEALTH))).toBe(true);
    expect(isCritical(sickPet(CRITICAL_HEALTH + 1))).toBe(false);
    expect(isCritical({ ...sickPet(10), sickSince: null })).toBe(false);
  });

  it('cures a critical pet with the right medicine', () => {
    const pet = sickPet(10);
    const { state } = applyAction(
      pet,
      { type: 'visitorMedicine', item: 'antibiotic' },
      pet.simulatedAt,
      rules,
    );
    expect(state.sickSince).toBeNull();
  });

  it('refuses a pet that is not in danger', () => {
    const pet = sickPet(80);
    expect(() =>
      applyAction(pet, { type: 'visitorMedicine', item: 'syrup' }, pet.simulatedAt, rules),
    ).toThrow(new GameError('not_critical'));
  });

  it('refuses anything but a medicine', () => {
    const pet = sickPet(10);
    expect(() =>
      applyAction(pet, { type: 'visitorMedicine', item: 'cookie' }, pet.simulatedAt, rules),
    ).toThrow(new GameError('unknown_item'));
  });
});
