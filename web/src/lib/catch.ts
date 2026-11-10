/**
 * The catch game: treats fall from the top of the field, the player moves a basket under them.
 * The field is 100 units wide and 100 high. The rules here are pure (the component only draws and
 * reads the pointer), so they can be tested without a browser.
 */

export const CATCH = {
  /** How long a game lasts. */
  durationMs: 12_000,
  /** Half the width of the basket, in field units. */
  basketHalf: 12,
  /** Where the basket's mouth is (the top of the catching zone) and how deep it is. */
  basketTop: 86,
  basketDepth: 8,
  /** A new item falls this often, at a random place. */
  spawnEveryMs: 600,
  /** Fall speed, in field units per second: a base and a random extra. */
  speedBase: 32,
  speedExtra: 18,
  /** Share of the items that are bad ones (catching one takes a treat away). */
  badShare: 0.2,
  /** Treats caught for a score of 1, 2 and 3. */
  thresholds: [3, 6, 9],
} as const;

export interface Faller {
  id: number;
  x: number;
  y: number;
  /** Units per second. */
  speed: number;
  bad: boolean;
  /** Which picture, among the good or the bad ones. */
  look: number;
}

export interface CatchState {
  /** Time played so far. */
  elapsedMs: number;
  /** The basket's centre. */
  basket: number;
  fallers: Faller[];
  /** Treats caught, minus what bad items took back (never below 0). */
  caught: number;
  spawnInMs: number;
  nextId: number;
}

export function newCatch(): CatchState {
  return { elapsedMs: 0, basket: 50, fallers: [], caught: 0, spawnInMs: 0, nextId: 0 };
}

export const isOver = (state: CatchState) => state.elapsedMs >= CATCH.durationMs;

/** The score (0 to 3) of a game, which is what the pet's `play` action takes. */
export function catchScore(caught: number): 0 | 1 | 2 | 3 {
  return CATCH.thresholds.filter((needed) => caught >= needed).length as 0 | 1 | 2 | 3;
}

/**
 * Moves the game forward by `dtMs` with the basket at `basket` (field units): items fall, the ones
 * in the basket are caught, new ones appear until the time is up. Returns the new state.
 */
export function stepCatch(
  state: CatchState,
  dtMs: number,
  basket: number,
  random: () => number = Math.random,
): CatchState {
  if (isOver(state)) return state;
  const dt = dtMs / 1000;
  const centre = Math.min(100 - CATCH.basketHalf, Math.max(CATCH.basketHalf, basket));
  let caught = state.caught;
  const fallers: Faller[] = [];
  for (const faller of state.fallers) {
    const y = faller.y + faller.speed * dt;
    const inMouth =
      y >= CATCH.basketTop &&
      y <= CATCH.basketTop + CATCH.basketDepth &&
      Math.abs(faller.x - centre) <= CATCH.basketHalf;
    if (inMouth) caught = Math.max(0, caught + (faller.bad ? -1 : 1));
    else if (y <= 100) fallers.push({ ...faller, y });
  }

  let spawnInMs = state.spawnInMs - dtMs;
  let nextId = state.nextId;
  const elapsedMs = Math.min(CATCH.durationMs, state.elapsedMs + dtMs);
  // Nothing new falls in the last second: it could not be caught anyway.
  while (spawnInMs <= 0 && elapsedMs < CATCH.durationMs - 1000) {
    fallers.push({
      id: nextId++,
      x: 6 + random() * 88,
      y: 0,
      speed: CATCH.speedBase + random() * CATCH.speedExtra,
      bad: random() < CATCH.badShare,
      look: Math.floor(random() * 3),
    });
    spawnInMs += CATCH.spawnEveryMs;
  }
  return { elapsedMs, basket: centre, fallers, caught, spawnInMs, nextId };
}
