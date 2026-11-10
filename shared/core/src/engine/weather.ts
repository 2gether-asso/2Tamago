import { gameHours, type GameRules } from './rules.js';
import { hashSeed } from './traits.js';
import type { WalkZone, WalkZoneId } from './zones.js';

/**
 * The weather of a walk zone: the same for everyone, the whole game day, and a pure function of
 * the day and the zone (no dice, nothing stored). Names are texts of the web app (`weather.<id>`).
 */
export const WEATHERS = ['sunny', 'cloudy', 'rain', 'wind'] as const;
export type Weather = (typeof WEATHERS)[number];

/** What the weather changes about a walk. */
export interface WeatherEffect {
  /** Added to the coins found (25 = a quarter more). */
  coinsPercent: number;
  /** Multiplies the chance of coming back with an item. */
  itemChanceFactor: number;
  /** Energy the walk costs on top of the zone's. */
  energyExtra: number;
}

export const WEATHER_EFFECTS: Record<Weather, WeatherEffect> = {
  sunny: { coinsPercent: 25, itemChanceFactor: 1, energyExtra: 0 },
  cloudy: { coinsPercent: 0, itemChanceFactor: 1, energyExtra: 0 },
  rain: { coinsPercent: 0, itemChanceFactor: 1.5, energyExtra: 5 },
  wind: { coinsPercent: 10, itemChanceFactor: 0.7, energyExtra: 0 },
};

/** How likely each weather is in each zone, in proportion to the weights. */
export const ZONE_WEATHER: Record<WalkZoneId, Record<Weather, number>> = {
  meadow: { sunny: 40, cloudy: 25, rain: 25, wind: 10 },
  forest: { sunny: 20, cloudy: 30, rain: 40, wind: 10 },
  beach: { sunny: 45, cloudy: 15, rain: 10, wind: 30 },
};

/** The game day (a whole number) at real time `t`, in the game's time zone (see `dayHour`). */
export function gameDay(rules: GameRules, t: number): number {
  return Math.floor(t / gameHours(rules, 1) / 24 + rules.night.clockOffsetHours / 24);
}

/** The weather in `zone` on the game day of real time `t`. */
export function weatherAt(rules: GameRules, t: number, zone: WalkZoneId): Weather {
  const weights = ZONE_WEATHER[zone];
  const total = WEATHERS.reduce((sum, weather) => sum + weights[weather], 0);
  let roll = (hashSeed(`weather:${gameDay(rules, t)}:${zone}`) / 2 ** 32) * total;
  for (const weather of WEATHERS) {
    roll -= weights[weather];
    if (roll < 0) return weather;
  }
  return 'cloudy';
}

/** The energy a walk costs under this weather. */
export function walkEnergyCost(zone: WalkZone, weather: Weather): number {
  return zone.energyCost + WEATHER_EFFECTS[weather].energyExtra;
}
