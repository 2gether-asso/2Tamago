import { describe, expect, it } from 'vitest';
import {
  bestPercent,
  boosted,
  discounted,
  EVENT_KINDS,
  EVENT_LIMITS,
  maxPercent,
} from '../src/index.js';

describe('event maths', () => {
  it('adds a percentage to coins, to the nearest coin', () => {
    expect(boosted(20, 50)).toBe(30);
    expect(boosted(20, 0)).toBe(20);
    expect(boosted(15, 100)).toBe(30);
    expect(boosted(3, 50)).toBe(5); // 4.5 rounds up
    expect(boosted(5, 10)).toBe(6); // 5.5
    expect(boosted(0, 200)).toBe(0);
  });

  it('takes a percentage off a price, rounded up, never to zero', () => {
    expect(discounted(100, 25)).toBe(75);
    expect(discounted(8, 25)).toBe(6);
    expect(discounted(9, 50)).toBe(5); // 4.5 up
    expect(discounted(8, 0)).toBe(8);
    expect(discounted(1, 90)).toBe(1);
    expect(discounted(8, EVENT_LIMITS.maxDiscountPercent)).toBe(1);
  });

  it('keeps the best of overlapping events of a kind, and ignores the other kinds', () => {
    const effects = [
      { kind: 'walk_coins', percent: 20 },
      { kind: 'walk_coins', percent: 50 },
      { kind: 'shop_discount', percent: 30 },
    ] as const;
    expect(bestPercent(effects, 'walk_coins')).toBe(50);
    expect(bestPercent(effects, 'shop_discount')).toBe(30);
    expect(bestPercent(effects, 'daily_bonus')).toBe(0);
    expect(bestPercent([], 'walk_coins')).toBe(0);
  });

  it('has a limit for every kind, and none makes the shop free', () => {
    for (const kind of EVENT_KINDS) expect(maxPercent(kind)).toBeGreaterThan(0);
    expect(maxPercent('shop_discount')).toBeLessThan(100);
  });
});
