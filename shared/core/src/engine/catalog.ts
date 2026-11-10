import type { FoodGroup, Illness, Species, Stats } from './types.js';

/** Shop and inventory items. Names are texts of the web app (`lib/i18n`), not of the engine. */

export interface SnackItem {
  kind: 'snack';
  id: string;
  price: number;
  effects: Partial<Pick<Stats, 'satiety' | 'happiness' | 'energy'>>;
  weight: number;
  /** Food group for the diet balance; a snack with no group is a sweet. */
  group?: FoodGroup;
  /** `false`: only found on walks, never sold. */
  forSale?: boolean;
}

/** A real meal, given with the "feed" care: filling, and counted in the diet balance. */
export interface MealItem {
  kind: 'meal';
  id: string;
  price: number;
  satiety: number;
  group: FoodGroup;
  weight: number;
  /** `false`: only found on walks, never sold. */
  forSale?: boolean;
}

/** A treatment, given with the "heal" care. */
export interface MedicineItem {
  kind: 'medicine';
  id: string;
  price: number;
  /** What it cures at once; `'any'` is a general remedy that only counts as one dose. */
  cures: Illness | 'any';
  forSale?: boolean;
}

export interface AccessoryItem {
  kind: 'accessory';
  id: string;
  price: number;
  /** `false`: only found on walks, never sold. */
  forSale?: boolean;
}

/** Where a piece of decoration goes in a room: the wall, the floor, or standing in the room. */
export type DecorSlot = 'wall' | 'floor' | 'prop';

/** Decoration for the player's room (see `room.ts`). Kept once, like an accessory. */
export interface DecorItem {
  kind: 'decor';
  id: string;
  price: number;
  slot: DecorSlot;
  /** `false`: only found on walks, never sold. */
  forSale?: boolean;
}

export type Item = SnackItem | MealItem | MedicineItem | AccessoryItem | DecorItem;

export const ITEMS = {
  cookie: {
    kind: 'snack',
    id: 'cookie',
    price: 8,
    effects: { happiness: 10, satiety: 5 },
    weight: 1,
  },
  strawberry: {
    kind: 'snack',
    id: 'strawberry',
    price: 12,
    effects: { happiness: 12, satiety: 8 },
    weight: 0,
    group: 'fruit',
  },
  warm_milk: {
    kind: 'snack',
    id: 'warm_milk',
    price: 15,
    effects: { energy: 15, happiness: 5 },
    weight: 0,
  },
  cake: {
    kind: 'snack',
    id: 'cake',
    price: 30,
    effects: { happiness: 30, satiety: 15 },
    weight: 3,
  },
  // Found on walks only (see `WALK_ZONES`): the price is what they are worth, not a shop price.
  blackberry: {
    kind: 'snack',
    id: 'blackberry',
    price: 10,
    effects: { happiness: 15, satiety: 10 },
    weight: 0,
    group: 'fruit',
    forSale: false,
  },
  mushroom: {
    kind: 'snack',
    id: 'mushroom',
    price: 14,
    effects: { satiety: 25, energy: 5 },
    weight: 1,
    group: 'veg',
    forSale: false,
  },
  coconut: {
    kind: 'snack',
    id: 'coconut',
    price: 16,
    effects: { energy: 25, satiety: 10 },
    weight: 1,
    group: 'fruit',
    forSale: false,
  },
  ice_cream: {
    kind: 'snack',
    id: 'ice_cream',
    price: 22,
    effects: { happiness: 28, satiety: 5 },
    weight: 2,
    forSale: false,
  },
  // Meals: a full ration for the "feed" care, one per food group.
  rice_bowl: { kind: 'meal', id: 'rice_bowl', price: 10, satiety: 35, group: 'grain', weight: 1 },
  veggie_stew: {
    kind: 'meal',
    id: 'veggie_stew',
    price: 14,
    satiety: 30,
    group: 'veg',
    weight: 0,
  },
  grilled_fish: {
    kind: 'meal',
    id: 'grilled_fish',
    price: 20,
    satiety: 40,
    group: 'protein',
    weight: 1,
  },
  fruit_salad: {
    kind: 'meal',
    id: 'fruit_salad',
    price: 12,
    satiety: 25,
    group: 'fruit',
    weight: 0,
  },
  // Medicines: the right one for an illness cures it at once, the syrup is a slower all-rounder.
  syrup: { kind: 'medicine', id: 'syrup', price: 15, cures: 'any' },
  antibiotic: { kind: 'medicine', id: 'antibiotic', price: 30, cures: 'infection' },
  digestive_tea: { kind: 'medicine', id: 'digestive_tea', price: 20, cures: 'indigestion' },
  vitamins: { kind: 'medicine', id: 'vitamins', price: 20, cures: 'weakness' },
  flower_crown: { kind: 'accessory', id: 'flower_crown', price: 150, forSale: false },
  starfish: { kind: 'accessory', id: 'starfish', price: 200, forSale: false },
  ribbon: { kind: 'accessory', id: 'ribbon', price: 50 },
  hat: { kind: 'accessory', id: 'hat', price: 80 },
  glasses: { kind: 'accessory', id: 'glasses', price: 120 },
  crown: { kind: 'accessory', id: 'crown', price: 300 },
  // Room decoration: wallpapers, floors and things to stand in the room.
  wall_stars: { kind: 'decor', id: 'wall_stars', price: 60, slot: 'wall' },
  wall_meadow: { kind: 'decor', id: 'wall_meadow', price: 60, slot: 'wall' },
  wall_sea: { kind: 'decor', id: 'wall_sea', price: 90, slot: 'wall' },
  floor_wood: { kind: 'decor', id: 'floor_wood', price: 40, slot: 'floor' },
  floor_tatami: { kind: 'decor', id: 'floor_tatami', price: 60, slot: 'floor' },
  floor_clouds: { kind: 'decor', id: 'floor_clouds', price: 90, slot: 'floor' },
  plant: { kind: 'decor', id: 'plant', price: 45, slot: 'prop' },
  lamp: { kind: 'decor', id: 'lamp', price: 70, slot: 'prop' },
  cushion: { kind: 'decor', id: 'cushion', price: 50, slot: 'prop' },
  fishbowl: { kind: 'decor', id: 'fishbowl', price: 120, slot: 'prop' },
} as const satisfies Record<string, Item>;

export type ItemId = keyof typeof ITEMS;
export type SnackId = { [K in ItemId]: (typeof ITEMS)[K] extends SnackItem ? K : never }[ItemId];
export type AccessoryId = {
  [K in ItemId]: (typeof ITEMS)[K] extends AccessoryItem ? K : never;
}[ItemId];

export type DecorId = { [K in ItemId]: (typeof ITEMS)[K] extends DecorItem ? K : never }[ItemId];

export type MealId = { [K in ItemId]: (typeof ITEMS)[K] extends MealItem ? K : never }[ItemId];
export type MedicineId = {
  [K in ItemId]: (typeof ITEMS)[K] extends MedicineItem ? K : never;
}[ItemId];

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

export function getItem(id: string): Item | undefined {
  return (ITEMS as Record<string, Item>)[id];
}

/** Whether the shop sells it (some items are only found on walks). */
export function isForSale(id: string): boolean {
  const item = getItem(id);
  return item !== undefined && item.forSale !== false;
}

export function isSnack(id: string): id is SnackId {
  return getItem(id)?.kind === 'snack';
}

export function isMeal(id: string): id is MealId {
  return getItem(id)?.kind === 'meal';
}

export function isMedicine(id: string): id is MedicineId {
  return getItem(id)?.kind === 'medicine';
}

export function isAccessory(id: string): id is AccessoryId {
  return getItem(id)?.kind === 'accessory';
}

export function isDecor(id: string): id is DecorId {
  return getItem(id)?.kind === 'decor';
}

export const DECOR_IDS = ITEM_IDS.filter(isDecor);

/** Kept once: owning a second one brings nothing (accessories and decoration). */
export function isUnique(id: string): boolean {
  return isAccessory(id) || isDecor(id);
}

/** Species names are proper names: the same in every language. */
export const SPECIES_LABELS: Record<Species, string> = {
  mochi: 'Mochi',
  pyon: 'Pyon',
  kumo: 'Kumo',
  koro: 'Koro',
  nyao: 'Nyao',
  toge: 'Toge',
  kame: 'Kame',
};
