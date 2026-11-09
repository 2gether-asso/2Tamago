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

  it('cures sickness after enough free medicine doses (a weak care)', () => {
    let pet: PetState = { ...hatched(), sickSince: T0 };
    const now = pet.simulatedAt;
    for (let i = 0; i < rules.medicineDoses / rules.freeMedicineDose - 1; i++) {
      pet = applyAction(pet, { type: 'medicine' }, now, rules).state;
      expect(pet.sickSince).not.toBeNull();
    }
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

describe('vacation', () => {
  /** A baby, a few hours after hatching, at a moment aligned on the simulation grid. */
  function child(): PetState {
    return simulate(hatched(), T0 + h(2), rules).state;
  }
  const start = (pet: PetState, at = pet.simulatedAt) =>
    applyAction(pet, { type: 'startVacation' }, at, rules);
  const codeOf = (fn: () => unknown) => {
    try {
      fn();
    } catch (error) {
      return (error as GameError).code;
    }
    return undefined;
  };

  it('freezes the pet while it is away', () => {
    const pet = child();
    const away = start(pet).state;
    const later = simulate(away, away.simulatedAt + h(200), rules);
    expect(later.events).toEqual([]);
    expect(later.state).toEqual(away);
    expect(moodOf(later.state)).toBe('vacation');
    expect(alertsOf({ ...later.state, stats: { ...later.state.stats, satiety: 0 } })).toEqual([]);
  });

  it('changes nothing about the life of the pet once it is back', () => {
    const pet = child();
    const awayFor = h(72);
    const away = start(pet).state;
    const back = applyAction(away, { type: 'endVacation' }, away.vacationSince! + awayFor, rules);
    expect(back.events.map((e) => e.type)).toEqual(['vacation_ended']);
    expect(back.state.vacationSince).toBeNull();
    expect(back.state.stats).toEqual(pet.stats);

    // The same stretch of life, with and without the vacation in the middle.
    const lived = simulate(pet, pet.simulatedAt + h(30), rules).state;
    const withVacation = simulate(back.state, back.state.simulatedAt + h(30), rules).state;
    expect(withVacation.stats).toEqual(lived.stats);
    expect(withVacation.stage).toBe(lived.stage);
    expect(withVacation.poops).toBe(lived.poops);
    expect(withVacation.careMistakes).toBe(lived.careMistakes);
    expect(withVacation.sickSince === null).toBe(lived.sickSince === null);
    // Its age did not grow while it was away.
    expect(withVacation.bornAt - lived.bornAt).toBe(awayFor);
  });

  it('keeps the dates it was waiting for in the future', () => {
    const pet = simulate(child(), T0 + h(5), rules).state;
    const away = start({ ...pet, tantrumSince: pet.simulatedAt - 60_000 }).state;
    const back = applyAction(away, { type: 'endVacation' }, away.vacationSince! + h(100), rules);
    expect(back.state.nextPoopAt - pet.nextPoopAt).toBe(h(100));
    expect(back.state.nextTantrumAt - pet.nextTantrumAt).toBe(h(100));
    expect(back.state.tantrumSince! - (pet.simulatedAt - 60_000)).toBe(h(100));
    // Nothing is due at the very moment it comes back.
    expect(simulate(back.state, back.state.simulatedAt, rules).events).toEqual([]);
  });

  it('ends by itself at the limit, and life goes on from there', () => {
    const pet = child();
    const away = start(pet).state;
    const limit = away.vacationSince! + h(rules.vacationMaxHours);
    const { state, events } = simulate(away, limit + h(5), rules);
    expect(state.vacationSince).toBeNull();
    expect(events).toContainEqual({ type: 'vacation_ended', at: limit, data: { automatic: true } });
    // Only the five hours after the limit counted.
    const lived = simulate(pet, pet.simulatedAt + h(5), rules).state;
    expect(state.stats).toEqual(lived.stats);
    expect(simulate(away, limit - 1, rules).state.vacationSince).toBe(away.vacationSince);
  });

  it('refuses every action but the return while away', () => {
    const away = start(child()).state;
    const at = away.simulatedAt + h(1);
    for (const action of [
      { type: 'feed' },
      { type: 'sleep' },
      { type: 'clean' },
      { type: 'caress' },
      { type: 'retire' },
      { type: 'startVacation' },
      { type: 'startOuting' },
      { type: 'visitorCaress' },
    ] as const) {
      expect(
        codeOf(() => applyAction(away, action, at, rules)),
        action.type,
      ).toBe('on_vacation');
    }
    expect(codeOf(() => applyAction(child(), { type: 'endVacation' }, T0 + h(3), rules))).toBe(
      'not_on_vacation',
    );
  });

  it('is not for eggs, nor for a pet out on a walk', () => {
    const egg = createPet({ name: 'Pompon', species: 'mochi', color: 120, now: T0 }, rules);
    expect(codeOf(() => applyAction(egg, { type: 'startVacation' }, T0 + 1000, rules))).toBe(
      'still_an_egg',
    );
    const grown = { ...child(), stage: 'child' as const };
    const walking = applyAction(grown, { type: 'startOuting' }, T0 + h(2.1), rules).state;
    expect(codeOf(() => applyAction(walking, { type: 'startVacation' }, T0 + h(2.2), rules))).toBe(
      'away',
    );
  });

  it('makes the owner wait between two vacations', () => {
    // Left alone for days the pet would leave: not what this is about.
    const kind = withRules({ departureEnabled: false });
    const away = applyAction(child(), { type: 'startVacation' }, T0 + h(2), kind).state;
    const home = applyAction(away, { type: 'endVacation' }, T0 + h(2 + 24), kind).state;
    const wait = gameHours(kind, kind.vacationCooldownHours);
    expect(
      codeOf(() =>
        applyAction(home, { type: 'startVacation' }, home.vacationEndedAt! + wait - 1, kind),
      ),
    ).toBe('vacation_cooldown');
    const again = applyAction(home, { type: 'startVacation' }, home.vacationEndedAt! + wait, kind);
    expect(again.state.vacationSince).toBe(home.vacationEndedAt! + wait);
  });
});
