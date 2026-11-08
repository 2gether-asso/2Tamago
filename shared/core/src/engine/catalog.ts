import type { Species, Stats } from './types.js';

/** Shop and inventory items. Names are texts of the web app (`lib/i18n`), not of the engine. */

export interface SnackItem {
  kind: 'snack';
  id: string;
  price: number;
  effects: Partial<Pick<Stats, 'satiety' | 'happiness' | 'energy'>>;
  weight: number;
}

export interface AccessoryItem {
  kind: 'accessory';
  id: string;
  price: number;
}

export type Item = SnackItem | AccessoryItem;

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
  ribbon: { kind: 'accessory', id: 'ribbon', price: 50 },
  hat: { kind: 'accessory', id: 'hat', price: 80 },
  glasses: { kind: 'accessory', id: 'glasses', price: 120 },
  crown: { kind: 'accessory', id: 'crown', price: 300 },
} as const satisfies Record<string, Item>;

export type ItemId = keyof typeof ITEMS;
export type SnackId = { [K in ItemId]: (typeof ITEMS)[K] extends SnackItem ? K : never }[ItemId];
export type AccessoryId = {
  [K in ItemId]: (typeof ITEMS)[K] extends AccessoryItem ? K : never;
}[ItemId];

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

export function getItem(id: string): Item | undefined {
  return (ITEMS as Record<string, Item>)[id];
}

export function isSnack(id: string): id is SnackId {
  return getItem(id)?.kind === 'snack';
}

export function isAccessory(id: string): id is AccessoryId {
  return getItem(id)?.kind === 'accessory';
}

/** Species names are proper names: the same in every language. */
export const SPECIES_LABELS: Record<Species, string> = {
  mochi: 'Mochi',
  pyon: 'Pyon',
  kumo: 'Kumo',
  koro: 'Koro',
  nyao: 'Nyao',
  toge: 'Toge',
};
