import { getItem, isAccessory, type ItemId } from './catalog.js';

/** Items swapped between two players: what is given, or what is asked for. */
export type Bundle = Partial<Record<ItemId, number>>;

export const TRADE_LIMITS = {
  /** Different items on one side of a trade. */
  maxKinds: 4,
  /** Of one item (an accessory is worn once: one only). */
  maxQuantity: 10,
} as const;

export type TradeProblem =
  | 'unknown_item'
  | 'bad_quantity'
  | 'too_many_kinds'
  | 'empty_offer'
  /** The same item on both sides: nothing would change hands. */
  | 'same_item';

/** The items of a bundle, in a stable order. */
export function bundleEntries(bundle: Bundle): [ItemId, number][] {
  return (Object.entries(bundle) as [ItemId, number][])
    .filter(([, quantity]) => quantity !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
}

function bundleProblem(bundle: Bundle): TradeProblem | null {
  const entries = bundleEntries(bundle);
  if (entries.length > TRADE_LIMITS.maxKinds) return 'too_many_kinds';
  for (const [id, quantity] of entries) {
    if (!getItem(id)) return 'unknown_item';
    const max = isAccessory(id) ? 1 : TRADE_LIMITS.maxQuantity;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > max) return 'bad_quantity';
  }
  return null;
}

/** Whether a trade of `offer` against `request` is allowed at all (null: it is). */
export function tradeProblem(offer: Bundle, request: Bundle): TradeProblem | null {
  const mine = bundleProblem(offer) ?? bundleProblem(request);
  if (mine) return mine;
  if (bundleEntries(offer).length === 0) return 'empty_offer';
  const asked = new Set(bundleEntries(request).map(([id]) => id));
  if (bundleEntries(offer).some(([id]) => asked.has(id))) return 'same_item';
  return null;
}
