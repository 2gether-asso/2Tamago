import { describe, expect, it } from 'vitest';
import { CATCH, catchScore, isOver, newCatch, stepCatch, type CatchState } from './catch.ts';

/** A repeatable random source (a small linear congruential generator). */
function seeded(seed: number): () => number {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return value / 2147483647;
  };
}

/** A random source that always answers the same. */
const always = (value: number) => () => value;

/** A game with one item already falling, and nothing else about to appear. */
function withFaller(partial: Partial<CatchState['fallers'][number]> = {}): CatchState {
  return {
    ...newCatch(),
    spawnInMs: 10_000,
    fallers: [{ id: 0, x: 50, y: 70, speed: 40, bad: false, look: 0, ...partial }],
  };
}

describe('catch game', () => {
  it('scores 0 to 3 from the treats caught', () => {
    const [one, two, three] = CATCH.thresholds;
    expect(catchScore(0)).toBe(0);
    expect(catchScore(one - 1)).toBe(0);
    expect(catchScore(one)).toBe(1);
    expect(catchScore(two - 1)).toBe(1);
    expect(catchScore(two)).toBe(2);
    expect(catchScore(three - 1)).toBe(2);
    expect(catchScore(three)).toBe(3);
    expect(catchScore(99)).toBe(3);
  });

  it('lets items fall, and catches the ones that land in the basket', () => {
    let state = withFaller();
    state = stepCatch(state, 250, 50); // 70 → 80: still falling
    expect(state.fallers[0]!.y).toBeCloseTo(80);
    expect(state.caught).toBe(0);
    state = stepCatch(state, 250, 50); // 80 → 90: in the mouth of the basket
    expect(state.caught).toBe(1);
    expect(state.fallers).toHaveLength(0);
  });

  it('misses the items that land beside the basket, and forgets them past the bottom', () => {
    let state = withFaller({ x: 20 });
    state = stepCatch(state, 250, 80);
    state = stepCatch(state, 250, 80);
    expect(state.caught).toBe(0);
    expect(state.fallers).toHaveLength(1);
    state = stepCatch(state, 500, 80); // 90 → 110
    expect(state.fallers).toHaveLength(0);
    expect(state.caught).toBe(0);
  });

  it('counts a bad item against the treats, never below zero', () => {
    let state = { ...withFaller({ bad: true }), caught: 2 };
    state = stepCatch(stepCatch(state, 250, 50), 250, 50);
    expect(state.caught).toBe(1);
    state = { ...withFaller({ bad: true }), caught: 0 };
    state = stepCatch(stepCatch(state, 250, 50), 250, 50);
    expect(state.caught).toBe(0);
  });

  it('keeps the basket inside the field', () => {
    expect(stepCatch(newCatch(), 16, -50).basket).toBe(CATCH.basketHalf);
    expect(stepCatch(newCatch(), 16, 500).basket).toBe(100 - CATCH.basketHalf);
    // So an item against the wall can always be reached.
    const state = stepCatch(withFaller({ x: 6, y: 85 }), 100, 0);
    expect(state.caught).toBe(1);
  });

  it('makes new items appear on a schedule, bad ones some of the time', () => {
    let state = newCatch();
    state = stepCatch(state, 16, 50, always(0.5));
    expect(state.fallers).toHaveLength(1);
    expect(state.fallers[0]).toMatchObject({ x: 50, y: 0, bad: false });
    // Nothing more until the next one is due.
    expect(stepCatch(state, 300, 50, always(0.5)).fallers.length).toBeGreaterThanOrEqual(1);
    const bad = stepCatch(newCatch(), 16, 50, always(0.05));
    expect(bad.fallers[0]!.bad).toBe(true);
  });

  it('takes a fixed time, and stops spawning at the end', () => {
    let state = newCatch();
    let spawnedLate = false;
    while (!isOver(state)) {
      const before = state.nextId;
      state = stepCatch(state, 50, 50, always(0.4));
      if (state.elapsedMs >= CATCH.durationMs - 1000 && state.nextId > before) spawnedLate = true;
    }
    expect(state.elapsedMs).toBe(CATCH.durationMs);
    expect(spawnedLate).toBe(false);
    // A finished game no longer moves.
    expect(stepCatch(state, 50, 10)).toBe(state);
  });

  it('can be won by someone who follows the items', () => {
    // A perfect player puts the basket under the lowest item every frame.
    let state = newCatch();
    const random = seeded(3);
    while (!isOver(state)) {
      const target = [...state.fallers].filter((f) => !f.bad).sort((a, b) => b.y - a.y)[0];
      state = stepCatch(state, 16, target?.x ?? 50, random);
    }
    expect(catchScore(state.caught)).toBe(3);
    // And not by staying still in a corner.
    let idle = newCatch();
    const random2 = seeded(3);
    while (!isOver(idle)) idle = stepCatch(idle, 16, 0, random2);
    expect(catchScore(idle.caught)).toBeLessThan(3);
  });
});
