import { describe, expect, it } from 'vitest';
import { bundleEntries, TRADE_LIMITS, tradeProblem } from '../src/index.js';
import { tradeBody } from '../src/contracts/index.js';

describe('tradeProblem', () => {
  it('accepts a plain swap, and a gift (nothing asked back)', () => {
    expect(tradeProblem({ cookie: 2 }, { mushroom: 1 })).toBeNull();
    expect(tradeProblem({ cookie: 2, cake: 1 }, {})).toBeNull();
    expect(tradeProblem({ starfish: 1 }, { flower_crown: 1 })).toBeNull();
  });

  it('wants something to be given', () => {
    expect(tradeProblem({}, { cookie: 1 })).toBe('empty_offer');
    expect(tradeProblem({}, {})).toBe('empty_offer');
  });

  it('keeps each side small', () => {
    const many = { cookie: 1, cake: 1, mushroom: 1, coconut: 1, ice_cream: 1 };
    expect(tradeProblem(many, {})).toBe('too_many_kinds');
    expect(tradeProblem({ cookie: 1 }, many)).toBe('too_many_kinds');
    const four = { cookie: 1, cake: 1, mushroom: 1, coconut: 1 };
    expect(Object.keys(four)).toHaveLength(TRADE_LIMITS.maxKinds);
    expect(tradeProblem(four, {})).toBeNull();
  });

  it('limits the quantities, and an accessory is worn once', () => {
    expect(tradeProblem({ cookie: TRADE_LIMITS.maxQuantity }, {})).toBeNull();
    expect(tradeProblem({ cookie: TRADE_LIMITS.maxQuantity + 1 }, {})).toBe('bad_quantity');
    expect(tradeProblem({ cookie: 0 }, {})).toBe('bad_quantity');
    expect(tradeProblem({ cookie: 1.5 }, {})).toBe('bad_quantity');
    expect(tradeProblem({ crown: 2 }, {})).toBe('bad_quantity');
    expect(tradeProblem({ cookie: 1 }, { hat: 2 })).toBe('bad_quantity');
  });

  it('refuses items that do not exist, and the same item on both sides', () => {
    expect(tradeProblem({ gold: 1 } as never, {})).toBe('unknown_item');
    expect(tradeProblem({ cookie: 1 }, { cookie: 2 })).toBe('same_item');
  });

  it('treats coins as part of the bundle', () => {
    expect(tradeProblem({}, { cookie: 1 }, 50, 0)).toBeNull();
    expect(tradeProblem({ cookie: 1 }, {}, 0, 50)).toBeNull();
    expect(tradeProblem({}, {}, 50, 0)).toBeNull(); // a gift of coins
    expect(tradeProblem({}, { cookie: 1 }, 0, 0)).toBe('empty_offer');
    expect(tradeProblem({}, {}, 0, 50)).toBe('empty_offer');
    expect(tradeProblem({ cookie: 1 }, {}, TRADE_LIMITS.maxCoins + 1, 0)).toBe('bad_coins');
    expect(tradeProblem({ cookie: 1 }, {}, 0, -1)).toBe('bad_coins');
    expect(tradeProblem({ cookie: 1 }, {}, 0, 1.5)).toBe('bad_coins');
    expect(tradeProblem({ cookie: 1 }, {}, 10, 20)).toBe('coins_both_sides');
  });

  it('lists a bundle in a stable order', () => {
    expect(bundleEntries({ mushroom: 1, cake: 3, cookie: 2 })).toEqual([
      ['cake', 3],
      ['cookie', 2],
      ['mushroom', 1],
    ]);
  });
});

describe('tradeBody', () => {
  const targetId = '00000000-0000-4000-8000-000000000000';
  it('checks the shape and the rules', () => {
    expect(tradeBody.safeParse({ targetId, offer: { cookie: 1 }, request: {} }).success).toBe(true);
    expect(tradeBody.safeParse({ targetId, offer: {}, request: { cookie: 1 } }).success).toBe(
      false,
    );
    expect(
      tradeBody.safeParse({ targetId, offer: { cookie: 1 }, request: { cookie: 1 } }).success,
    ).toBe(false);
    expect(tradeBody.safeParse({ targetId, offer: { nothing: 1 }, request: {} }).success).toBe(
      false,
    );
    expect(tradeBody.safeParse({ targetId: 'x', offer: { cookie: 1 }, request: {} }).success).toBe(
      false,
    );
  });
});
