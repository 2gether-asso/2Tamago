import { describe, expect, it } from 'vitest';
import {
  applyAction,
  applyHeirloom,
  characterSheet,
  createPet,
  FORMS,
  HEIRLOOM,
  HEIRLOOM_BONUS,
  heirloomOf,
  simulate,
  TRICKS,
  withRules,
  type Form,
  type PetState,
} from '../src/index.js';

const rules = withRules();
const T0 = Date.UTC(2026, 10, 9, 9);
const egg = (heirloom?: Parameters<typeof createPet>[0]['heirloom']) =>
  createPet({ name: 'Mochi', species: 'mochi', color: 120, seed: 7, now: T0, heirloom }, rules);

/** An elder of this form that retired (the engine rules for getting there are tested elsewhere). */
function retired(form: Form | null, status: PetState['status'] = 'retired'): PetState {
  const base = egg();
  return { ...base, name: 'Doyenne', stage: 'elder', form, status };
}

describe('heirloom', () => {
  it('is left by a retirement, with the bonus of its form', () => {
    for (const form of FORMS) {
      expect(heirloomOf(retired(form))).toEqual({
        from: 'Doyenne',
        species: 'mochi',
        form,
        bonus: HEIRLOOM_BONUS[form],
      });
    }
  });

  it('is not left by one that departs, one still alive, or one with no form', () => {
    expect(heirloomOf(retired('radiant', 'gone'))).toBeNull();
    expect(heirloomOf(retired('radiant', 'alive'))).toBeNull();
    expect(heirloomOf(retired(null))).toBeNull();
  });

  it('comes out of the retire action itself', () => {
    const elder: PetState = { ...egg(), stage: 'elder', form: 'gentle', status: 'alive' };
    const { state } = applyAction(elder, { type: 'retire' }, elder.simulatedAt, rules);
    expect(heirloomOf(state)?.bonus).toBe('tricks');
  });

  it('gives the next egg a bond head start from a radiant one', () => {
    const next = egg({ from: 'Doyenne', species: 'mochi', form: 'radiant', bonus: 'bond' });
    expect(next.bond).toBe(HEIRLOOM.bond);
    expect(next.stage).toBe('egg');
    expect(egg().bond).toBe(0);
  });

  it('gives a head start on every trick from a gentle one', () => {
    const next = egg({ from: 'Doyenne', species: 'mochi', form: 'gentle', bonus: 'tricks' });
    for (const trick of TRICKS) expect(next.tricks[trick]).toBe(HEIRLOOM.trickProgress);
    expect(next.bond).toBe(0);
  });

  it('gives luck from a rascal one: two points, and it lasts', () => {
    const plain = egg();
    const next = egg({ from: 'Doyenne', species: 'mochi', form: 'rascal', bonus: 'luck' });
    // The rolled traits (and so the temperament's own head start) are the same: seed 7 both times.
    expect(next.traits).toEqual(plain.traits);
    const gained = (state: PetState) => characterSheet(state).stats.luck;
    expect(gained(next)).toBe(gained(plain) + 2);
    // Neither the bond nor the tricks change, and a day later the luck is still there.
    expect(next.bond).toBe(0);
    const later = simulate(next, T0 + 24 * 3_600_000, rules).state;
    expect(gained(later)).toBe(gained(plain) + 2);
  });

  it('never goes past the top', () => {
    const state = { ...egg(), bond: 95, tricks: { sit: 95, spin: 0, jump: 0, highfive: 0 } };
    applyHeirloom(state, { from: 'Doyenne', species: 'mochi', form: 'radiant', bonus: 'bond' });
    expect(state.bond).toBe(100);
    applyHeirloom(state, { from: 'Doyenne', species: 'mochi', form: 'gentle', bonus: 'tricks' });
    expect(state.tricks).toEqual({
      sit: 100,
      spin: HEIRLOOM.trickProgress,
      jump: HEIRLOOM.trickProgress,
      highfive: HEIRLOOM.trickProgress,
    });
  });
});
