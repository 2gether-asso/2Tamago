import type { ItemId } from './catalog.js';
import { gameHours, type GameRules } from './rules.js';
import { hashSeed, prng, traitsOf } from './traits.js';
import type { PetEvent, PetState, Stage, Temperament } from './types.js';

/**
 * Wishes (the "wants" of the Sims): now and then, the pet wishes for something. Granting it in time
 * makes it very happy; missing it costs nothing, the wish just fades. They give each visit a small
 * goal of its own, picked by the pet's personality, rather than the same chores every time.
 * Deterministic: the wish comes from the pet and the time, like the walk events.
 */
export const WISH_IDS = [
  'play',
  'treat',
  'walk',
  'caress',
  'train',
  'meal',
  'bath',
  'praise',
] as const;
export type WishId = (typeof WISH_IDS)[number];

export interface Wish {
  id: WishId;
  /** For a treat: the one it fancies. */
  item?: ItemId;
  since: number;
  until: number;
}

export const WISH = {
  /** How long a wish waits to be granted (game hours). */
  hours: 4,
  /** Delay before the next wish, once one is granted or has faded (game hours). */
  intervalHours: 3,
  /** The first wish comes soon after hatching, to show what wishes are. */
  firstAfterHatchHours: 0.5,
  happiness: 15,
  bond: 3,
  /** Paid by the server, outside the daily cap of play coins (wishes are few a day). */
  coins: 5,
  /** Treats a pet may fancy: sold in the shop, so a wish is never out of reach. */
  treats: ['cookie', 'strawberry', 'warm_milk'] as const satisfies readonly ItemId[],
} as const;

/** How likely each wish is, before the temperament. */
const BASE_WEIGHTS: Record<WishId, number> = {
  play: 4,
  treat: 3,
  walk: 3,
  caress: 4,
  train: 2,
  meal: 2,
  bath: 2,
  praise: 2,
};

/** Each temperament has its favourite wishes. */
const TEMPERAMENT_WEIGHTS: Record<Temperament, Partial<Record<WishId, number>>> = {
  greedy: { treat: 3, meal: 3 },
  sleepy: { caress: 2, praise: 2 },
  cuddly: { caress: 3, praise: 2 },
  prankster: { play: 3, walk: 2 },
  tidy: { bath: 4 },
  sturdy: { walk: 3, train: 2 },
};

/** Wishes a stage cannot have: a baby neither walks nor learns tricks. */
const NEEDS_GROWN: ReadonlySet<WishId> = new Set(['walk', 'train']);

function weightsFor(state: PetState): [WishId, number][] {
  const favourite = TEMPERAMENT_WEIGHTS[traitsOf(state).temperament];
  const young: Stage[] = ['egg', 'baby'];
  return WISH_IDS.filter((id) => !(young.includes(state.stage) && NEEDS_GROWN.has(id))).map(
    (id) => [id, BASE_WEIGHTS[id] * (favourite[id] ?? 1)],
  );
}

/** The wish a pet makes at `t` (pure). Never the same twice in a row. */
export function pickWish(state: PetState, t: number, previous?: WishId): Pick<Wish, 'id' | 'item'> {
  const next = prng(hashSeed(`wish:${state.name}:${state.bornAt}:${t}`));
  const weights = weightsFor(state).filter(([id]) => id !== previous);
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = next() * total;
  let id: WishId = weights[0]![0];
  for (const [candidate, weight] of weights) {
    roll -= weight;
    if (roll < 0) {
      id = candidate;
      break;
    }
  }
  if (id !== 'treat') return { id };
  return { id, item: WISH.treats[Math.floor(next() * WISH.treats.length)]! };
}

/** One simulation tick of the wishes: a wish fades when its time is up, a new one comes later. */
export function wishTick(state: PetState, t: number, rules: GameRules, events: PetEvent[]): void {
  const wish = state.wish;
  if (wish) {
    if (t < wish.until) return;
    state.wish = null;
    state.lastWish = wish.id;
    state.nextWishAt = t + gameHours(rules, WISH.intervalHours);
    events.push({ type: 'wish_faded', at: t, data: { wish: wish.id } });
    return;
  }
  // A pet that is asleep, out, sick or throwing a tantrum has other things on its mind.
  if (state.asleep || state.outing || state.sickSince !== null || state.tantrumSince !== null) {
    return;
  }
  if (t < (state.nextWishAt ?? 0)) return;
  const picked = pickWish(state, t, state.lastWish ?? undefined);
  state.wish = { ...picked, since: t, until: t + gameHours(rules, WISH.hours) };
  events.push({ type: 'wish_made', at: t, data: { wish: picked.id, item: picked.item ?? null } });
}

/** What grants a wish: the action (and its item) that the pet was hoping for. */
export interface WishGrant {
  type: string;
  item?: ItemId | undefined;
}

export function grantsWish(wish: Pick<Wish, 'id' | 'item'>, action: WishGrant): boolean {
  switch (wish.id) {
    case 'play':
      return action.type === 'play';
    case 'treat':
      return action.type === 'treat' && (wish.item === undefined || action.item === wish.item);
    case 'walk':
      return action.type === 'startOuting';
    case 'caress':
      return action.type === 'caress';
    case 'train':
      return action.type === 'train';
    case 'meal':
      // A real meal from the bag, not the free ration.
      return action.type === 'feed' && action.item !== undefined;
    case 'bath':
      return action.type === 'clean';
    case 'praise':
      return action.type === 'praise';
  }
}

/**
 * Called after an action succeeded: if it is what the pet wished for, the wish comes true. The
 * caller has already checked that the action had an effect (a caress on cooldown grants nothing).
 */
export function grantWish(
  state: PetState,
  action: WishGrant,
  at: number,
  rules: GameRules,
  events: PetEvent[],
): boolean {
  const wish = state.wish;
  if (!wish || at >= wish.until || !grantsWish(wish, action)) return false;
  state.wish = null;
  state.lastWish = wish.id;
  state.nextWishAt = at + gameHours(rules, WISH.intervalHours);
  state.stats.happiness = Math.min(100, state.stats.happiness + WISH.happiness);
  state.bond = Math.min(100, state.bond + WISH.bond);
  events.push({ type: 'wish_granted', at, data: { wish: wish.id, item: wish.item ?? null } });
  return true;
}
