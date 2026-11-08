import { createPet, gameHours, simulate, withRules, type PetState } from '@2tamago/core';
import { buildAdminStats, type StatsInput } from './admin-stats.js';

const rules = withRules();
const T0 = Date.UTC(2026, 10, 1, 12);
const DAY = 86_400_000;
const NOW = T0 + 10 * DAY;

/** A hatched companion with the given traits and fate. */
function pet(overrides: Partial<PetState> = {}): PetState {
  const egg = createPet({ name: 'P', species: 'mochi', color: 0, seed: 1, now: T0 }, rules);
  const state = simulate(egg, T0 + gameHours(rules, 0.2), rules).state;
  return { ...state, ...overrides };
}
const withTemperament = (temperament: 'greedy' | 'sleepy', rest: Partial<PetState> = {}) =>
  pet({ traits: { temperament, pattern: 'plain', eyes: 'round' }, ...rest });

function input(overrides: Partial<StatsInput> = {}): StatsInput {
  return {
    now: NOW,
    rules,
    timezone: 'UTC',
    players: [],
    pets: [],
    inventory: [],
    interactions: [],
    walks: [],
    encounters: 0,
    ...overrides,
  };
}

describe('buildAdminStats', () => {
  it('is empty and safe on an empty game', () => {
    const stats = buildAdminStats(input());
    expect(stats.players.total).toBe(0);
    expect(stats.economy.averageCoins).toBe(0);
    expect(stats.averages.happiness).toBe(0);
    expect(stats.activity.days).toHaveLength(14);
    expect(stats.balance.byTemperament.every((g) => g.pets === 0 && g.departureRate === null)).toBe(
      true,
    );
  });

  it('counts players, who is active, and coins and items', () => {
    const stats = buildAdminStats(
      input({
        players: [
          { createdAt: NOW - DAY, lastSeenAt: NOW - 3_600_000, coins: 100 },
          { createdAt: NOW - 3 * DAY, lastSeenAt: NOW - 3 * DAY, coins: 50 },
          { createdAt: NOW - 30 * DAY, lastSeenAt: NOW - 20 * DAY, coins: 0 },
        ],
        inventory: [
          { itemId: 'cookie', quantity: 2 },
          { itemId: 'cake', quantity: 5 },
        ],
      }),
    );
    expect(stats.players).toMatchObject({
      total: 3,
      newLast7Days: 2,
      activeToday: 1,
      activeLast7Days: 2,
    });
    expect(stats.economy).toMatchObject({ coinsInCirculation: 150, averageCoins: 50 });
    expect(stats.economy.items[0]).toEqual({ itemId: 'cake', quantity: 5 });
  });

  it('splits companions by status, stage and form, leaving eggs out', () => {
    const egg = createPet({ name: 'E', species: 'mochi', color: 0, now: T0 }, rules);
    const stats = buildAdminStats(
      input({
        pets: [
          egg,
          pet({ stage: 'child', form: 'radiant' }),
          pet({ stage: 'adult', form: 'rascal' }),
          pet({ status: 'gone', endedAt: T0 + 2 * DAY, form: 'rascal' }),
          pet({ status: 'retired', endedAt: T0 + 5 * DAY, form: 'gentle' }),
        ],
      }),
    );
    expect(stats.pets).toMatchObject({ total: 5, hatched: 4, alive: 2, retired: 1, departed: 1 });
    expect(stats.pets.byStage).toMatchObject({ child: 1, adult: 1 });
    expect(stats.pets.byForm).toEqual({ radiant: 1, gentle: 1, rascal: 2 });
    expect(stats.players.withLivingPet).toBe(3); // the egg is alive too
  });

  it('compares temperaments: departure rate, lifespan and mistakes per day', () => {
    const stats = buildAdminStats(
      input({
        pets: [
          withTemperament('greedy', { status: 'gone', endedAt: T0 + 2 * DAY, careMistakes: 4 }),
          withTemperament('greedy', { status: 'retired', endedAt: T0 + 4 * DAY, careMistakes: 0 }),
          withTemperament('sleepy', { status: 'retired', endedAt: T0 + 6 * DAY, careMistakes: 1 }),
        ],
      }),
    );
    const greedy = stats.balance.byTemperament.find((g) => g.key === 'greedy')!;
    expect(greedy).toMatchObject({ pets: 2, departed: 1, retired: 1, departureRate: 0.5 });
    expect(greedy.avgLifespanDays).toBeCloseTo(3, 0);
    expect(greedy.mistakesPerDay).toBeCloseTo(4 / 6, 1);
    const sleepy = stats.balance.byTemperament.find((g) => g.key === 'sleepy')!;
    expect(sleepy).toMatchObject({ pets: 1, departureRate: 0 });
    // Species is a separate view of the same companions.
    expect(stats.balance.bySpecies.find((g) => g.key === 'mochi')?.pets).toBe(3);
  });

  it('averages the living companions only', () => {
    const living = pet({ stats: { ...pet({}).stats, happiness: 80 }, bond: 40 });
    const gone = pet({
      status: 'gone',
      endedAt: T0 + DAY,
      stats: { ...pet({}).stats, happiness: 0 },
    });
    const stats = buildAdminStats(input({ pets: [living, gone] }));
    expect(stats.averages.happiness).toBe(80);
    expect(stats.averages.bond).toBe(40);
  });

  it('puts activity in the right days of the time zone, ignoring older events', () => {
    const stats = buildAdminStats(
      input({
        players: [{ createdAt: NOW - 100, lastSeenAt: NOW, coins: 0 }],
        interactions: [
          { createdAt: NOW - 100, kind: 'caress' },
          { createdAt: NOW - 100, kind: 'gift' },
          { createdAt: NOW - DAY, kind: 'caress' },
          { createdAt: NOW - 40 * DAY, kind: 'caress' },
        ],
        walks: [{ startedAt: NOW - 2 * DAY }],
        encounters: 7,
      }),
    );
    const days = stats.activity.days;
    expect(days.at(-1)).toMatchObject({ newPlayers: 1, caresses: 1, gifts: 1, walks: 0 });
    expect(days.at(-2)?.caresses).toBe(1);
    expect(days.at(-3)?.walks).toBe(1);
    expect(days.reduce((sum, d) => sum + d.caresses, 0)).toBe(2);
    expect(stats.activity.encounters).toBe(7);
  });
});
