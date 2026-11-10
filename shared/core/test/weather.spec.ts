import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createPet,
  gameDay,
  gameHours,
  GameError,
  rollFinds,
  simulate,
  walkEnergyCost,
  WALK_ZONE_IDS,
  WALK_ZONES,
  WEATHER_EFFECTS,
  WEATHERS,
  weatherAt,
  withRules,
  ZONE_WEATHER,
  type PetState,
  type Weather,
  type WalkZoneId,
} from '../src/index.js';

const rules = withRules();
const T0 = Date.UTC(2026, 0, 1);
const DAY = gameHours(rules, 24);
const dice =
  (...values: number[]) =>
  () =>
    values.shift() ?? 0;

/** The first game day on which `zone` has this weather. */
function dayWith(zone: WalkZoneId, weather: Weather): number {
  for (let day = 0; day < 400; day++)
    if (weatherAt(rules, T0 + day * DAY, zone) === weather) return day;
  throw new Error(`no ${weather} in ${zone}`);
}

/** A rested adult, ready to go out at `at`. */
function adultAt(at: number, energy = 100): PetState {
  const egg = createPet({ name: 'Pompon', species: 'mochi', color: 120, now: at }, rules);
  const state = simulate(egg, at + gameHours(rules, 0.2), rules).state;
  return { ...state, stage: 'adult', stats: { ...state.stats, energy, satiety: 100 } };
}

describe('weather', () => {
  it('is the same all day, in a zone, and changes from one day to the next', () => {
    for (const zone of WALK_ZONE_IDS) {
      const morning = weatherAt(rules, T0 + gameHours(rules, 1), zone);
      expect(weatherAt(rules, T0 + gameHours(rules, 23), zone), zone).toBe(morning);
      expect(weatherAt(rules, T0 + gameHours(rules, 1), zone), zone).toBe(morning);
      // Over a few weeks, every weather comes.
      const seen = new Set(
        Array.from({ length: 60 }, (_, day) => weatherAt(rules, T0 + day * DAY, zone)),
      );
      expect([...seen].sort(), zone).toEqual([...WEATHERS].sort());
    }
  });

  it('is not the same everywhere on the same day', () => {
    const days = Array.from({ length: 60 }, (_, day) => T0 + day * DAY);
    const apart = days.filter(
      (t) => new Set(WALK_ZONE_IDS.map((zone) => weatherAt(rules, t, zone))).size > 1,
    );
    expect(apart.length).toBeGreaterThan(20);
  });

  it('follows the weights of each zone', () => {
    const days = 3000;
    for (const zone of WALK_ZONE_IDS) {
      const counts = Object.fromEntries(WEATHERS.map((w) => [w, 0])) as Record<Weather, number>;
      for (let day = 0; day < days; day++) counts[weatherAt(rules, T0 + day * DAY, zone)]++;
      const total = WEATHERS.reduce((sum, w) => sum + ZONE_WEATHER[zone][w], 0);
      for (const weather of WEATHERS) {
        expect(counts[weather] / days, `${zone} ${weather}`).toBeCloseTo(
          ZONE_WEATHER[zone][weather] / total,
          1,
        );
      }
    }
    // The forest is the rainy one, the beach the sunny one.
    expect(ZONE_WEATHER.forest.rain).toBeGreaterThan(ZONE_WEATHER.meadow.rain);
    expect(ZONE_WEATHER.beach.sunny).toBeGreaterThan(ZONE_WEATHER.forest.sunny);
  });

  it('changes day with the clock of the game’s time zone', () => {
    const east = { ...rules, night: { ...rules.night, clockOffsetHours: 5 } };
    // 19:00 UTC: still the same day in Greenwich, already the next one five hours ahead.
    const evening = Date.UTC(2026, 0, 1, 19);
    expect(gameDay(east, evening)).toBe(gameDay(rules, evening) + 1);
    const morning = Date.UTC(2026, 0, 1, 7);
    expect(gameDay(east, morning)).toBe(gameDay(rules, morning));
  });

  it('is neutral when cloudy, and changes the finds otherwise', () => {
    expect(WEATHER_EFFECTS.cloudy).toEqual({
      coinsPercent: 0,
      itemChanceFactor: 1,
      energyExtra: 0,
    });
    // Meadow coins 5 to 15; the first die picks 10, the second decides on an item (25% chance).
    expect(rollFinds('meadow', dice(0.5, 0.99)).coins).toBe(10);
    expect(rollFinds('meadow', dice(0.5, 0.99), 'cloudy').coins).toBe(10);
    expect(rollFinds('meadow', dice(0.5, 0.99), 'sunny').coins).toBe(13); // 10 + 25%, rounded
    expect(rollFinds('meadow', dice(0.5, 0.99), 'wind').coins).toBe(11);
    // 0.3 misses at 25%, but rain makes it 37.5%; wind (17.5%) is worse than 0.2.
    expect(rollFinds('meadow', dice(0.5, 0.3, 0.1), 'cloudy').items).toEqual([]);
    expect(rollFinds('meadow', dice(0.5, 0.3, 0.1), 'rain').items).toHaveLength(1);
    expect(rollFinds('meadow', dice(0.5, 0.2, 0.1), 'cloudy').items).toHaveLength(1);
    expect(rollFinds('meadow', dice(0.5, 0.2, 0.1), 'wind').items).toEqual([]);
  });

  it('costs more energy in the rain, when asking for it and when charging it', () => {
    const day = dayWith('beach', 'rain');
    const at = T0 + day * DAY + gameHours(rules, 10);
    const rain = walkEnergyCost(WALK_ZONES.beach, 'rain');
    expect(rain).toBe(WALK_ZONES.beach.energyCost + WEATHER_EFFECTS.rain.energyExtra);

    const go = (energy: number) => () =>
      applyAction(adultAt(at, energy), { type: 'startOuting', zone: 'beach' }, at, rules);
    const refused = () => {
      try {
        go(rain + 4)();
      } catch (error) {
        return (error as GameError).code;
      }
    };
    expect(refused()).toBe('too_tired');
    expect(go(rain + 5)).not.toThrow();

    // Charged what was announced, at the end of the walk (the day it set off).
    const out = go(100)().state;
    const back = applyAction(out, { type: 'endOuting' }, out.outing!.endsAt, rules).state;
    const cloudyDay = T0 + dayWith('beach', 'cloudy') * DAY + gameHours(rules, 10);
    const out2 = applyAction(
      adultAt(cloudyDay),
      { type: 'startOuting', zone: 'beach' },
      cloudyDay,
      rules,
    ).state;
    const back2 = applyAction(out2, { type: 'endOuting' }, out2.outing!.endsAt, rules).state;
    const spent = (before: PetState, after: PetState) => before.stats.energy - after.stats.energy;
    // The same walk, five energy dearer in the rain (the pet is a little rested by the clock).
    expect(spent(out, back) - spent(out2, back2)).toBeCloseTo(WEATHER_EFFECTS.rain.energyExtra, 0);
  });

  it('prices a walk with the weather it sets off in, even if it ends on another day', () => {
    const day = dayWith('meadow', 'rain');
    // Sets off late in the evening of a rainy day: the walk ends after midnight.
    const at = T0 + day * DAY + gameHours(rules, 23.9);
    const out = applyAction(adultAt(at), { type: 'startOuting', zone: 'meadow' }, at, rules).state;
    expect(weatherAt(rules, out.outing!.startedAt, 'meadow')).toBe('rain');
    const back = applyAction(out, { type: 'endOuting' }, out.outing!.endsAt, rules).state;
    expect(back.outing).toBeNull();
  });
});
