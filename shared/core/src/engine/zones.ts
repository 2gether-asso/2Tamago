import { type ItemId } from './catalog.js';
import { STAGES, type Stage } from './types.js';

/**
 * Walk zones: where the pet goes decides how long it is away, what it costs and what it brings
 * back. Pure data: the names are texts of the web app (`zone.<id>`), and the dice are thrown by
 * the caller (`rollFinds` takes the random function).
 */
export const WALK_ZONE_IDS = ['meadow', 'forest', 'beach'] as const;
export type WalkZoneId = (typeof WALK_ZONE_IDS)[number];

export const DEFAULT_ZONE: WalkZoneId = 'meadow';

export interface WalkZone {
  id: WalkZoneId;
  /** The youngest stage that may go there. */
  minStage: Stage;
  /** Times `rules.outingHours`. */
  durationFactor: number;
  /** Energy spent by the walk (the pet needs 5 more to set off). */
  energyCost: number;
  satietyCost: number;
  bondGain: number;
  /** Experience in vigor earned by walking there. */
  vigorXp: number;
  /** Coins brought back, whole numbers from `min` to `max`. */
  coins: { min: number; max: number };
  /** Chance (0 to 1) of coming back with one item. */
  itemChance: number;
  /** What that item may be, in proportion to the weights. */
  items: { id: ItemId; weight: number }[];
}

export const WALK_ZONES: Record<WalkZoneId, WalkZone> = {
  meadow: {
    id: 'meadow',
    minStage: 'child',
    durationFactor: 1,
    energyCost: 15,
    satietyCost: 10,
    bondGain: 3,
    vigorXp: 2,
    coins: { min: 5, max: 15 },
    itemChance: 0.25,
    items: [
      { id: 'cookie', weight: 30 },
      { id: 'strawberry', weight: 30 },
      { id: 'warm_milk', weight: 20 },
      { id: 'cake', weight: 15 },
      { id: 'flower_crown', weight: 5 },
    ],
  },
  forest: {
    id: 'forest',
    minStage: 'teen',
    durationFactor: 2,
    energyCost: 25,
    satietyCost: 15,
    bondGain: 4,
    vigorXp: 3,
    coins: { min: 10, max: 22 },
    itemChance: 0.45,
    items: [
      { id: 'blackberry', weight: 30 },
      { id: 'mushroom', weight: 30 },
      { id: 'strawberry', weight: 20 },
      { id: 'warm_milk', weight: 15 },
      { id: 'flower_crown', weight: 5 },
    ],
  },
  beach: {
    id: 'beach',
    minStage: 'adult',
    durationFactor: 4,
    energyCost: 35,
    satietyCost: 20,
    bondGain: 5,
    vigorXp: 4,
    coins: { min: 20, max: 40 },
    itemChance: 0.3,
    items: [
      { id: 'coconut', weight: 30 },
      { id: 'ice_cream', weight: 30 },
      { id: 'cake', weight: 20 },
      { id: 'starfish', weight: 20 },
    ],
  },
};

export function isWalkZone(id: string): id is WalkZoneId {
  return id in WALK_ZONES;
}

/** Whether a pet of this stage may walk there. */
export function zoneOpenTo(zone: WalkZone, stage: Stage): boolean {
  return STAGES.indexOf(stage) >= STAGES.indexOf(zone.minStage);
}

export interface Finds {
  coins: number;
  items: ItemId[];
}

/**
 * What a walk brings back. `random` returns numbers from 0 (included) to 1 (excluded), such as
 * `Math.random`: the engine does not throw dice, whoever calls it does.
 */
export function rollFinds(zoneId: WalkZoneId, random: () => number): Finds {
  const zone = WALK_ZONES[zoneId];
  const { min, max } = zone.coins;
  const finds: Finds = { coins: min + Math.floor(random() * (max - min + 1)), items: [] };
  if (random() < zone.itemChance) {
    const total = zone.items.reduce((sum, item) => sum + item.weight, 0);
    let roll = random() * total;
    for (const item of zone.items) {
      roll -= item.weight;
      if (roll < 0) {
        finds.items.push(item.id);
        break;
      }
    }
  }
  return finds;
}
