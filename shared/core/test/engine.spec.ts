import { describe, expect, it } from 'vitest';
import {
  alertsOf,
  applyAction,
  createPet,
  gameHours,
  GameError,
  moodOf,
  simulate,
  withRules,
  type PetState,
} from '../src/index.js';

const rules = withRules();
const T0 = Date.UTC(2026, 0, 1);
const h = (hours: number) => gameHours(rules, hours);

function hatched(): PetState {
  const egg = createPet({ name: 'Pompon', species: 'mochi', color: 120, now: T0 }, rules);
  return simulate(egg, T0 + h(0.2), rules).state;
}

describe('simulate', () => {
  it('hatches the egg after the egg duration', () => {
    const egg = createPet({ name: 'Pompon', species: 'mochi', color: 120, now: T0 }, rules);
    expect(simulate(egg, T0 + h(0.05), rules).state.stage).toBe('egg');
    const { state, events } = simulate(egg, T0 + h(0.2), rules);
    expect(state.stage).toBe('baby');
    expect(events.map((e) => e.type)).toContain('hatched');
  });

  it('is deterministic whatever the call frequency', () => {
    const pet = hatched();
    const end = pet.simulatedAt + h(30);
    const once = simulate(pet, end, rules).state;

    let stepwise = pet;
    for (let t = pet.simulatedAt; t <= end; t += 7 * 60_000 + 13_000) {
      stepwise = simulate(stepwise, t, rules).state;
    }
    stepwise = simulate(stepwise, end, rules).state;
    expect(stepwise).toEqual(once);
  });

  it('lets needs decay, poops accumulate and records care mistakes', () => {
    const { state, events } = simulate(hatched(), T0 + h(20), rules);
    expect(state.stats.satiety).toBe(0);
    expect(state.poops).toBeGreaterThan(0);
    expect(state.careMistakes).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'care_mistake')).toBe(true);
    expect(alertsOf(state)).toContain('hungry');
  });

  it('survives a full day of neglect', () => {
    expect(simulate(hatched(), T0 + h(24), rules).state.status).toBe('alive');
  });

  it('makes a neglected pet sick, then lets it leave', () => {
    const { state, events } = simulate(hatched(), T0 + h(24 * 5), rules);
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(['fell_ill', 'departed']));
    expect(state.status).toBe('gone');
    expect(moodOf(state)).toBe('gone');
  });

  it('never lets the pet leave when departure is disabled', () => {
    const gentle = withRules({ departureEnabled: false });
    const egg = createPet({ name: 'Pompon', species: 'mochi', color: 0, now: T0 }, gentle);
    const { state } = simulate(egg, T0 + gameHours(gentle, 24 * 5), gentle);
    expect(state.status).toBe('alive');
    expect(state.stats.health).toBeGreaterThan(0);
  });

  it('evolves through the stages with a form', () => {
    let pet = hatched();
    // A well cared pet: checked every 2 hours, put to bed when tired.
    for (let t = pet.simulatedAt; t < T0 + h(13); t += h(2)) {
      pet = simulate(pet, t, rules).state;
      if (pet.asleep) continue;
      const act = (action: Parameters<typeof applyAction>[1]) =>
        (pet = applyAction(pet, action, t, rules).state);
      act({ type: 'clean' });
      act({ type: 'caress' });
      if (pet.stats.satiety < 95) act({ type: 'feed' });
      if (pet.stats.energy >= 30) act({ type: 'play', score: 3 });
      else act({ type: 'sleep' });
    }
    expect(pet.stage).toBe('child');
    expect(pet.form).toBe('radiant');
  });

  it('honours the time scale', () => {
    const fast = withRules({ timeScale: 60 });
    const egg = createPet({ name: 'Pompon', species: 'pyon', color: 0, now: T0 }, fast);
    // 12 game minutes = 12 real seconds.
    expect(simulate(egg, T0 + 12_000, fast).state.stage).toBe('baby');
  });
});

describe('applyAction', () => {
  it('feeds a hungry pet and refuses when full', () => {
    const pet = simulate(hatched(), T0 + h(4), rules).state;
    const fed = applyAction(pet, { type: 'feed' }, T0 + h(4), rules).state;
    expect(fed.stats.satiety).toBeGreaterThan(pet.stats.satiety);
    const full = { ...fed, stats: { ...fed.stats, satiety: 100 } };
    expect(() => applyAction(full, { type: 'feed' }, T0 + h(4), rules)).toThrow(GameError);
  });

  it('does not mutate its input', () => {
    const pet = hatched();
    const copy = structuredClone(pet);
    applyAction(pet, { type: 'play', score: 2 }, T0 + h(1), rules);
    expect(pet).toEqual(copy);
  });

  it('refuses actions on an egg', () => {
    const egg = createPet({ name: 'Pompon', species: 'kumo', color: 0, now: T0 }, rules);
    expect(() => applyAction(egg, { type: 'feed' }, T0, rules)).toThrowError(/œuf/);
  });

  it('cures sickness after enough medicine doses', () => {
    let pet: PetState = { ...hatched(), sickSince: T0 };
    const now = pet.simulatedAt;
    pet = applyAction(pet, { type: 'medicine' }, now, rules).state;
    expect(pet.sickSince).not.toBeNull();
    const result = applyAction(pet, { type: 'medicine' }, now, rules);
    expect(result.state.sickSince).toBeNull();
    expect(result.events.map((e) => e.type)).toContain('cured');
  });

  it('rewards scolding a tantrum, not scolding for nothing', () => {
    const pet = { ...hatched(), stage: 'child' as const };
    const now = pet.simulatedAt;
    const unfair = applyAction(pet, { type: 'scold' }, now, rules).state;
    expect(unfair.stats.happiness).toBeLessThan(pet.stats.happiness);

    const calling = { ...pet, tantrumSince: now };
    const fair = applyAction(calling, { type: 'scold' }, now, rules).state;
    expect(fair.stats.discipline).toBe(pet.stats.discipline + 25);
    expect(fair.tantrumSince).toBeNull();
  });

  it('runs an outing from start to return', () => {
    const pet = { ...hatched(), stage: 'child' as const };
    const start = pet.simulatedAt;
    const out = applyAction(pet, { type: 'startOuting' }, start, rules).state;
    expect(moodOf(out)).toBe('away');
    expect(() => applyAction(out, { type: 'feed' }, start, rules)).toThrowError(/promenade/);
    expect(() => applyAction(out, { type: 'endOuting' }, start + 1000, rules)).toThrow(GameError);
    const back = applyAction(out, { type: 'endOuting' }, start + h(rules.outingHours), rules).state;
    expect(back.outing).toBeNull();
    expect(back.bond).toBeGreaterThan(pet.bond);
  });

  it('levels up tricks with training', () => {
    let pet: PetState = { ...hatched(), stage: 'child' };
    const now = pet.simulatedAt;
    const levels: number[] = [];
    for (let i = 0; i < 8; i++) {
      pet = { ...pet, stats: { ...pet.stats, energy: 100, satiety: 100 } };
      const result = applyAction(pet, { type: 'train', trick: 'sit' }, now, rules);
      pet = result.state;
      for (const e of result.events)
        if (e.type === 'trick_level_up') levels.push(Number(e.data?.level));
    }
    expect(levels).toEqual([1, 2]);
  });

  it('applies the caress cooldown', () => {
    const pet = hatched();
    const now = pet.simulatedAt;
    const once = applyAction(pet, { type: 'caress' }, now, rules).state;
    const twice = applyAction(once, { type: 'caress' }, now + 1000, rules).state;
    expect(twice.bond).toBe(once.bond);
  });
});
