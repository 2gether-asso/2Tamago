import { gameHours, FORMS, SPECIES, STAGES, TEMPERAMENTS, traitsOf } from '@2tamago/core';
import type { Form, GameRules, PetState, Stage } from '@2tamago/core';
import type { AdminStats, DailyActivity, GroupStats } from '@2tamago/core/contracts';
import { dayOf } from '../common/clock.js';

/** Raw data of the game, as read from the database. */
export interface StatsInput {
  now: number;
  rules: GameRules;
  timezone: string;
  players: { createdAt: number; lastSeenAt: number; coins: number }[];
  pets: PetState[];
  inventory: { itemId: string; quantity: number }[];
  interactions: { createdAt: number; kind: 'caress' | 'gift' }[];
  walks: { startedAt: number }[];
  encounters: number;
}

const DAY_MS = 86_400_000;
const ACTIVITY_DAYS = 14;

const round = (value: number, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};
const mean = (values: number[]) =>
  values.length === 0 ? null : round(values.reduce((a, b) => a + b, 0) / values.length);

/** The figures the admin looks at to follow the game and balance it. Pure: no I/O. */
export function buildAdminStats(input: StatsInput): AdminStats {
  const { now, rules, pets } = input;
  const gameDay = gameHours(rules, 24);
  const hatched = pets.filter((pet) => pet.stage !== 'egg');
  const alive = hatched.filter((pet) => pet.status === 'alive');

  const byStage = Object.fromEntries(STAGES.map((stage) => [stage, 0])) as Record<Stage, number>;
  for (const pet of alive) byStage[pet.stage]++;
  const byForm = Object.fromEntries(FORMS.map((form) => [form, 0])) as Record<Form, number>;
  for (const pet of hatched) if (pet.form) byForm[pet.form]++;

  const average = (pick: (pet: PetState) => number) => mean(alive.map(pick)) ?? 0;

  /** Game days lived: until the end, or until now for a living companion. */
  const daysLived = (pet: PetState) => Math.max(0, ((pet.endedAt ?? now) - pet.bornAt) / gameDay);

  const group = (key: string, members: PetState[]): GroupStats => {
    const living = members.filter((pet) => pet.status === 'alive');
    const ended = members.filter((pet) => pet.status !== 'alive');
    const departed = ended.filter((pet) => pet.status === 'gone').length;
    const lived = members.reduce((sum, pet) => sum + daysLived(pet), 0);
    const mistakes = members.reduce((sum, pet) => sum + pet.careMistakes, 0);
    return {
      key,
      pets: members.length,
      alive: living.length,
      retired: ended.length - departed,
      departed,
      departureRate: ended.length === 0 ? null : round(departed / ended.length, 2),
      avgLifespanDays: mean(ended.map(daysLived)),
      mistakesPerDay: lived === 0 ? null : round(mistakes / lived, 2),
      avgBond: mean(living.map((pet) => pet.bond)),
      avgHappiness: mean(living.map((pet) => pet.stats.happiness)),
    };
  };

  const days = lastDays(now, input.timezone);
  const activity: DailyActivity[] = days.map((day) => ({
    day,
    newPlayers: 0,
    caresses: 0,
    gifts: 0,
    walks: 0,
  }));
  const bucket = (time: number) => activity.find((d) => d.day === dayOf(time, input.timezone));
  for (const player of input.players) {
    const entry = bucket(player.createdAt);
    if (entry) entry.newPlayers++;
  }
  for (const interaction of input.interactions) {
    const entry = bucket(interaction.createdAt);
    if (entry) entry[interaction.kind === 'caress' ? 'caresses' : 'gifts']++;
  }
  for (const walk of input.walks) {
    const entry = bucket(walk.startedAt);
    if (entry) entry.walks++;
  }

  const coins = input.players.reduce((sum, player) => sum + player.coins, 0);
  const items = new Map<string, number>();
  for (const row of input.inventory) {
    items.set(row.itemId, (items.get(row.itemId) ?? 0) + row.quantity);
  }

  return {
    generatedAt: now,
    players: {
      total: input.players.length,
      newLast7Days: input.players.filter((p) => now - p.createdAt < 7 * DAY_MS).length,
      activeToday: input.players.filter((p) => now - p.lastSeenAt < DAY_MS).length,
      activeLast7Days: input.players.filter((p) => now - p.lastSeenAt < 7 * DAY_MS).length,
      withLivingPet: pets.filter((pet) => pet.status === 'alive').length,
    },
    pets: {
      total: pets.length,
      hatched: hatched.length,
      alive: alive.length,
      retired: hatched.filter((pet) => pet.status === 'retired').length,
      departed: hatched.filter((pet) => pet.status === 'gone').length,
      byStage,
      byForm,
    },
    averages: {
      satiety: average((pet) => pet.stats.satiety),
      happiness: average((pet) => pet.stats.happiness),
      energy: average((pet) => pet.stats.energy),
      hygiene: average((pet) => pet.stats.hygiene),
      health: average((pet) => pet.stats.health),
      discipline: average((pet) => pet.stats.discipline),
      bond: average((pet) => pet.bond),
    },
    economy: {
      coinsInCirculation: coins,
      averageCoins: input.players.length === 0 ? 0 : round(coins / input.players.length),
      items: [...items.entries()]
        .map(([itemId, quantity]) => ({ itemId, quantity }))
        .sort((a, b) => b.quantity - a.quantity),
    },
    activity: { days: activity, encounters: input.encounters },
    balance: {
      byTemperament: TEMPERAMENTS.map((temperament) =>
        group(
          temperament,
          hatched.filter((pet) => traitsOf(pet).temperament === temperament),
        ),
      ),
      bySpecies: SPECIES.map((species) =>
        group(
          species,
          hatched.filter((pet) => pet.species === species),
        ),
      ),
    },
  };
}

/** The last days in the game time zone, oldest first, today included. */
function lastDays(now: number, timezone: string): string[] {
  const days: string[] = [];
  for (let i = ACTIVITY_DAYS - 1; i >= 0; i--) {
    const day = dayOf(now - i * DAY_MS, timezone);
    if (days[days.length - 1] !== day) days.push(day);
  }
  return days;
}
