import { describe, expect, it } from 'vitest';
import {
  applyAction,
  characterSheet,
  createPet,
  gameHours,
  HISTORY_SIZE,
  pickWalkEvent,
  RPG_STATS,
  simulate,
  statOf,
  traitsOf,
  walkEventPossible,
  WALK_EVENT_IDS,
  withRules,
  XP_PER_POINT,
  type PetEvent,
  type PetState,
  type Stage,
  type WalkZoneId,
} from '../src/index.js';

const rules = withRules();
const T0 = Date.UTC(2026, 0, 1);

/** A rested, fed pet of the given stage, ready to go out (and to train). */
function pet(stage: Stage): PetState {
  const egg = createPet({ name: 'Pompon', species: 'mochi', color: 120, seed: 7, now: T0 }, rules);
  const state = simulate(egg, T0 + gameHours(rules, 0.2), rules).state;
  return {
    ...state,
    stage,
    stats: { ...state.stats, energy: 100, satiety: 100, happiness: 50 },
  };
}

/** One complete walk, with the seed of the walk event. */
function walk(
  state: PetState,
  zone: WalkZoneId,
  seed: number,
): { state: PetState; events: PetEvent[] } {
  const start = state.simulatedAt;
  const out = applyAction(state, { type: 'startOuting', zone }, start, rules).state;
  return applyAction(out, { type: 'endOuting', seed }, out.outing!.endsAt, rules);
}

/** A seed that gives this event for this pet (the table is deterministic). */
function seedFor(state: PetState, zone: WalkZoneId, id: string): number {
  for (let seed = 0; seed < 10_000; seed++) {
    if (pickWalkEvent(state, zone, seed) === id) return seed;
  }
  throw new Error(`no seed for ${id}`);
}

const eventOf = (events: PetEvent[]) => events.find((e) => e.type === 'walk_event')!.data!;

/** A pet whose temperament gives no head start to wit. */
function plain(stage: Stage): PetState {
  const state = pet(stage);
  state.traits = { ...traitsOf(state), temperament: 'sturdy' };
  return state;
}

describe('character sheet', () => {
  it('starts at 1 everywhere, one point more for the temperament', () => {
    const sheet = characterSheet(pet('child'));
    const total = RPG_STATS.reduce((sum, stat) => sum + sheet.stats[stat], 0);
    expect(total).toBe(RPG_STATS.length + 1);
    expect(sheet.level).toBe(1);
    expect(sheet.history).toEqual([]);
  });

  it('grows with training, play and walks', () => {
    let state = plain('child');
    for (let i = 0; i < 4; i++) {
      state = applyAction(state, { type: 'train', trick: 'sit' }, state.simulatedAt, rules).state;
      state.stats.energy = 100;
    }
    expect(statOf(state, 'wit')).toBe(1 + Math.floor(12 / XP_PER_POINT));
    state = applyAction(state, { type: 'play', score: 3 }, state.simulatedAt, rules).state;
    expect(state.rpg!.xp.agility).toBe(2);
    expect(characterSheet(state).level).toBe(2);
    state = walk(state, 'meadow', 1).state;
    expect(state.rpg!.xp.vigor).toBeGreaterThanOrEqual(2);
  });

  it('reports every point gained', () => {
    const state = plain('child');
    state.rpg = { xp: { wit: 9 }, quests: {}, history: [] };
    const result = applyAction(state, { type: 'train', trick: 'sit' }, state.simulatedAt, rules);
    expect(result.events.find((e) => e.type === 'stat_up')?.data).toMatchObject({
      stat: 'wit',
      value: 2,
    });
  });

  it('is capped', () => {
    const state = pet('child');
    state.rpg = { xp: { wit: 10_000 }, quests: {}, history: [] };
    expect(statOf(state, 'wit')).toBe(20);
  });
});

describe('walk events', () => {
  it('are deterministic: same pet, zone and seed, same event', () => {
    const state = pet('adult');
    expect(walk(state, 'forest', 3).state).toEqual(walk(state, 'forest', 3).state);
  });

  it('derive their seed from the walk when none is given', () => {
    const state = pet('adult');
    const out = applyAction(
      state,
      { type: 'startOuting', zone: 'forest' },
      state.simulatedAt,
      rules,
    ).state;
    const end = out.outing!.endsAt;
    const a = applyAction(out, { type: 'endOuting' }, end, rules);
    const b = applyAction(out, { type: 'endOuting' }, end, rules);
    expect(a.state).toEqual(b.state);
  });

  it('depend on the age and the zone', () => {
    const child = pet('child');
    const adult = pet('adult');
    expect(walkEventPossible(child, 'meadow', 'old_coin')).toBe(false);
    expect(walkEventPossible(adult, 'meadow', 'old_coin')).toBe(true);
    expect(walkEventPossible(adult, 'meadow', 'crab_pinch')).toBe(false);
    expect(walkEventPossible(adult, 'beach', 'crab_pinch')).toBe(true);
    for (let seed = 0; seed < 200; seed++) {
      expect(walkEventPossible(child, 'meadow', pickWalkEvent(child, 'meadow', seed))).toBe(true);
    }
  });

  it('are logged, with a short history', () => {
    let state = pet('child');
    for (let i = 0; i < HISTORY_SIZE + 3; i++) {
      state = walk(state, 'meadow', i).state;
      state.stats.energy = 100;
      state.stats.satiety = 100;
    }
    expect(state.rpg!.history).toHaveLength(HISTORY_SIZE);
    expect(state.rpg!.history.at(-1)!.zone).toBe('meadow');
  });

  it('hand over coins and items as data, not to the pet', () => {
    const state = pet('adult');
    const result = walk(state, 'beach', seedFor(state, 'beach', 'buried_treasure'));
    expect(eventOf(result.events)).toMatchObject({
      event: 'buried_treasure',
      coins: 30,
      item: 'starfish',
    });
  });

  it('are softened by agility when something goes wrong', () => {
    const clumsy = pet('child');
    const agile = pet('child');
    agile.rpg = { xp: { agility: 60 }, quests: {}, history: [] };
    const seed = seedFor(clumsy, 'meadow', 'muddy_puddle');
    expect(pickWalkEvent(agile, 'meadow', seed)).toBe('muddy_puddle');
    const a = walk(clumsy, 'meadow', seed).state.stats.hygiene;
    const b = walk(agile, 'meadow', seed).state.stats.hygiene;
    expect(b).toBeGreaterThan(a);
  });

  it('every event is possible for some pet somewhere', () => {
    const state = pet('adult');
    state.rpg = { xp: { wit: 20 }, quests: {}, history: [] };
    const zones: WalkZoneId[] = ['meadow', 'forest', 'beach'];
    for (const id of WALK_EVENT_IDS) {
      const anyone = [0, 1, 2].some((step) =>
        zones.some((zone) =>
          [0, 50].some((wit) =>
            walkEventPossible(
              { ...state, rpg: { xp: { wit }, quests: { hermit: step }, history: [] } },
              zone,
              id,
            ),
          ),
        ),
      );
      expect(anyone, id).toBe(true);
    }
  });
});

describe('quest chain', () => {
  it('remembers the past: each step needs the one before', () => {
    let state = plain('child');
    expect(walkEventPossible(state, 'meadow', 'hermit_gift')).toBe(false);
    expect(walkEventPossible(state, 'meadow', 'hermit_meet')).toBe(true);

    state = walk(state, 'meadow', seedFor(state, 'meadow', 'hermit_meet')).state;
    expect(state.rpg!.quests.hermit).toBe(1);
    expect(state.rpg!.history.at(-1)!.event).toBe('hermit_meet');
    expect(walkEventPossible(state, 'meadow', 'hermit_meet')).toBe(false);
  });

  it('asks for wit at the riddle, which can be retried', () => {
    const state = plain('child');
    state.rpg = { xp: {}, quests: { hermit: 1 }, history: [] };
    expect(walkEventPossible(state, 'meadow', 'hermit_riddle')).toBe(false);
    expect(walkEventPossible(state, 'meadow', 'hermit_riddle_failed')).toBe(true);
    const failed = walk(state, 'meadow', seedFor(state, 'meadow', 'hermit_riddle_failed'));
    expect(eventOf(failed.events)).toMatchObject({ event: 'hermit_riddle_failed', step: 1 });
    expect(failed.state.rpg!.quests.hermit).toBe(1);
    // It learned from it: clever enough for the next try.
    expect(statOf(failed.state, 'wit')).toBe(1);
    const retry = { ...failed.state, rpg: { ...failed.state.rpg!, xp: { wit: 10 } } };
    expect(walkEventPossible(retry, 'meadow', 'hermit_riddle')).toBe(true);
    expect(walkEventPossible(retry, 'meadow', 'hermit_riddle_failed')).toBe(false);
  });

  it('can be completed, with a reward', () => {
    const state = plain('teen');
    state.rpg = { xp: { wit: 10 }, quests: { hermit: 1 }, history: [] };
    const solved = walk(state, 'forest', seedFor(state, 'forest', 'hermit_riddle'));
    expect(solved.state.rpg!.quests.hermit).toBe(2);
    const next = { ...solved.state };
    next.stats = { ...next.stats, energy: 100, satiety: 100 };
    const done = walk(next, 'meadow', seedFor(next, 'meadow', 'hermit_gift'));
    expect(eventOf(done.events)).toMatchObject({
      event: 'hermit_gift',
      quest: 'hermit',
      step: 3,
      questDone: true,
      coins: 40,
      item: 'flower_crown',
    });
    expect(characterSheet(done.state).quests[0]).toMatchObject({ done: true });
    for (const id of ['hermit_meet', 'hermit_riddle', 'hermit_riddle_failed', 'hermit_gift'] as const) {
      expect(walkEventPossible(done.state, 'meadow', id)).toBe(false);
    }
  });
});
