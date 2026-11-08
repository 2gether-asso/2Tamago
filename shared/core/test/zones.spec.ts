import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createPet,
  gameHours,
  GameError,
  getItem,
  isForSale,
  ITEMS,
  rollFinds,
  simulate,
  WALK_ZONE_IDS,
  WALK_ZONES,
  withRules,
  zoneOpenTo,
  type PetState,
  type Stage,
} from '../src/index.js';

const rules = withRules();
const T0 = Date.UTC(2026, 0, 1);
const h = (hours: number) => gameHours(rules, hours);

/** A rested, fed pet of the given stage, ready to go out. */
function pet(stage: Stage): PetState {
  const egg = createPet({ name: 'Pompon', species: 'mochi', color: 120, now: T0 }, rules);
  const state = simulate(egg, T0 + h(0.2), rules).state;
  return {
    ...state,
    stage,
    stats: { ...state.stats, energy: 100, satiety: 100, happiness: 50 },
  };
}
const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return (error as GameError).code;
  }
  return undefined;
};

/** A `random` that gives these numbers in turn. */
const dice =
  (...values: number[]) =>
  () =>
    values.shift() ?? 0;

describe('walk zones', () => {
  it('defaults to the meadow, as walks always were', () => {
    const start = pet('child').simulatedAt;
    const out = applyAction(pet('child'), { type: 'startOuting' }, start, rules).state;
    expect(out.outing).toEqual({
      startedAt: start,
      endsAt: start + h(rules.outingHours),
      zone: 'meadow',
    });
  });

  it('lasts longer, and costs more, the further it goes', () => {
    const at = pet('adult').simulatedAt;
    const results = WALK_ZONE_IDS.map((zone) => {
      const out = applyAction(pet('adult'), { type: 'startOuting', zone }, at, rules).state;
      const back = applyAction(out, { type: 'endOuting' }, out.outing!.endsAt, rules).state;
      return {
        zone,
        hours: (out.outing!.endsAt - at) / h(1),
        energy: pet('adult').stats.energy - back.stats.energy,
      };
    });
    expect(results.map((r) => r.hours)).toEqual(
      WALK_ZONE_IDS.map((zone) => rules.outingHours * WALK_ZONES[zone].durationFactor),
    );
    expect(results[0]!.hours).toBeLessThan(results[1]!.hours);
    expect(results[1]!.hours).toBeLessThan(results[2]!.hours);
    // The pet is back at the end, a little hungrier, never restored by the walk itself.
    for (const { zone, energy } of results)
      expect(energy, zone).toBeGreaterThanOrEqual(WALK_ZONES[zone].energyCost - 1);
  });

  it('is opened by growing up', () => {
    const at = pet('child').simulatedAt;
    const go = (stage: Stage, zone: 'meadow' | 'forest' | 'beach') => () =>
      applyAction(pet(stage), { type: 'startOuting', zone }, at, rules);
    expect(codeOf(go('child', 'meadow'))).toBeUndefined();
    expect(codeOf(go('child', 'forest'))).toBe('zone_locked');
    expect(codeOf(go('teen', 'forest'))).toBeUndefined();
    expect(codeOf(go('teen', 'beach'))).toBe('zone_locked');
    expect(codeOf(go('adult', 'beach'))).toBeUndefined();
    expect(codeOf(go('elder', 'beach'))).toBeUndefined();
    expect(codeOf(go('baby', 'meadow'))).toBe('too_young');
    expect(zoneOpenTo(WALK_ZONES.forest, 'child')).toBe(false);
    expect(zoneOpenTo(WALK_ZONES.forest, 'elder')).toBe(true);
  });

  it('asks for the energy the walk costs, plus a margin', () => {
    const tired = (energy: number) => {
      const p = pet('adult');
      return { ...p, stats: { ...p.stats, energy } };
    };
    const at = pet('adult').simulatedAt;
    const beach = WALK_ZONES.beach.energyCost;
    expect(
      codeOf(() =>
        applyAction(tired(beach + 4), { type: 'startOuting', zone: 'beach' }, at, rules),
      ),
    ).toBe('too_tired');
    expect(
      codeOf(() =>
        applyAction(tired(beach + 5), { type: 'startOuting', zone: 'beach' }, at, rules),
      ),
    ).toBeUndefined();
    // The same pet is fit for the meadow.
    expect(
      codeOf(() =>
        applyAction(tired(beach + 4), { type: 'startOuting', zone: 'meadow' }, at, rules),
      ),
    ).toBeUndefined();
  });

  it('brings back the old walks, begun before zones, as meadow walks', () => {
    const at = pet('child').simulatedAt;
    const end = at + h(rules.outingHours);
    const old = { ...pet('child'), outing: { startedAt: at, endsAt: end } };
    const modern = applyAction(pet('child'), { type: 'startOuting', zone: 'meadow' }, at, rules);
    expect(applyAction(old, { type: 'endOuting' }, end, rules).state).toEqual(
      applyAction(modern.state, { type: 'endOuting' }, end, rules).state,
    );
  });
});

describe('rollFinds', () => {
  it('draws coins over the whole range of the zone', () => {
    for (const id of WALK_ZONE_IDS) {
      const { min, max } = WALK_ZONES[id].coins;
      expect(rollFinds(id, dice(0, 1)).coins).toBe(min);
      expect(rollFinds(id, dice(0.999999, 1)).coins).toBe(max);
    }
  });

  it('brings an item only when the dice allow it', () => {
    const { itemChance } = WALK_ZONES.forest;
    expect(rollFinds('forest', dice(0.5, itemChance - 0.01, 0)).items).toHaveLength(1);
    expect(rollFinds('forest', dice(0.5, itemChance, 0)).items).toEqual([]);
  });

  it('picks the item in proportion to the weights', () => {
    const zone = WALK_ZONES.beach;
    const total = zone.items.reduce((sum, item) => sum + item.weight, 0);
    let before = 0;
    for (const item of zone.items) {
      // The middle of the item's slice of the total.
      const roll = (before + item.weight / 2) / total;
      expect(rollFinds('beach', dice(0, 0, roll)).items).toEqual([item.id]);
      before += item.weight;
    }
    // The top of the range still lands on the last item.
    expect(rollFinds('beach', dice(0, 0, 0.999999)).items).toEqual([zone.items.at(-1)!.id]);
  });

  it('is the same for the same dice', () => {
    const roll = () => rollFinds('meadow', dice(0.3, 0.1, 0.6));
    expect(roll()).toEqual(roll());
  });

  it('only brings items that exist, and finds each zone’s specialities', () => {
    for (const id of WALK_ZONE_IDS) {
      const zone = WALK_ZONES[id];
      expect(zone.items.length).toBeGreaterThan(0);
      for (const { id: item, weight } of zone.items) {
        expect(getItem(item), `${id}: ${item}`).toBeDefined();
        expect(weight).toBeGreaterThan(0);
      }
      expect(zone.itemChance).toBeGreaterThan(0);
      expect(zone.itemChance).toBeLessThanOrEqual(1);
      expect(zone.coins.min).toBeLessThanOrEqual(zone.coins.max);
    }
    const forest = WALK_ZONES.forest.items.map((item) => item.id);
    const beach = WALK_ZONES.beach.items.map((item) => item.id);
    expect(forest).toContain('mushroom');
    expect(beach).toContain('coconut');
  });
});

describe('items found on walks', () => {
  it('are not sold, and every item the shop sells has a price', () => {
    for (const id of [
      'blackberry',
      'mushroom',
      'coconut',
      'ice_cream',
      'flower_crown',
      'starfish',
    ]) {
      expect(isForSale(id), id).toBe(false);
    }
    for (const id of ['cookie', 'cake', 'ribbon', 'crown']) expect(isForSale(id), id).toBe(true);
    expect(isForSale('nothing')).toBe(false);
    for (const item of Object.values(ITEMS)) expect(item.price).toBeGreaterThan(0);
  });

  it('every item found can be found somewhere', () => {
    const found = new Set(Object.values(WALK_ZONES).flatMap((z) => z.items.map((i) => i.id)));
    for (const item of Object.values(ITEMS)) {
      if (item.forSale === false) expect(found.has(item.id as never), item.id).toBe(true);
    }
  });
});
