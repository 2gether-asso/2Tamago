/**
 * Events: a bonus an admin switches on for a few days. The economy they touch is the server's
 * (walks, daily bonus, caresses, shop); what they do to a number is here, and pure.
 */
export const EVENT_KINDS = ['walk_coins', 'daily_bonus', 'caress_reward', 'shop_discount'] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const EVENT_LIMITS = {
  /** More coins, in percent. */
  maxBonusPercent: 300,
  /** Cheaper shop, in percent: never free. */
  maxDiscountPercent: 90,
  /** An event is for a few days, not a new normal. */
  maxDays: 14,
} as const;

export interface EventEffect {
  kind: EventKind;
  percent: number;
}

/** The greatest percentage allowed for a kind of event. */
export function maxPercent(kind: EventKind): number {
  return kind === 'shop_discount' ? EVENT_LIMITS.maxDiscountPercent : EVENT_LIMITS.maxBonusPercent;
}

/** An amount of coins, `percent` % more (rounded to a whole coin). */
export function boosted(base: number, percent: number): number {
  return Math.round((base * (100 + percent)) / 100);
}

/** A price, `percent` % less: rounded up, and never below 1. */
export function discounted(price: number, percent: number): number {
  return Math.max(1, Math.ceil((price * (100 - percent)) / 100));
}

/** When several events of a kind overlap, the best one counts (they do not add up). */
export function bestPercent(effects: readonly EventEffect[], kind: EventKind): number {
  return effects.reduce(
    (best, effect) => (effect.kind === kind ? Math.max(best, effect.percent) : best),
    0,
  );
}
