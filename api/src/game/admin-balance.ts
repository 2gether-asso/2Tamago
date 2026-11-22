import {
  FORMS,
  gameHours,
  ILLNESSES,
  MISSION_IDS,
  MISSIONS,
  NEEDS,
  WISH_IDS,
  type Form,
  type GameRules,
  type Illness,
  type MissionId,
  type MissionProgress,
  type Need,
  type PetState,
  type WishId,
} from '@2tamago/core';
import type {
  AdminBalance,
  BalanceDay,
  BalanceInsight,
  BalanceInsightId,
  BalanceLevel,
  CareBucket,
} from '@2tamago/core/contracts';
import { dayOf } from '../common/clock.js';
import { lastDays } from './admin-stats.js';

/** A pet event of the window, as kept in the activity feed. */
export type BalanceEvent =
  | { at: number; kind: 'illness'; illness: string | null }
  | { at: number; kind: 'mistake'; need: string | null }
  | { at: number; kind: 'wish'; wish: string | null };

export interface BalanceInput {
  now: number;
  rules: GameRules;
  timezone: string;
  /** Every pet, the living ones simulated up to now. */
  pets: PetState[];
  events: BalanceEvent[];
  /** Daily bonus claims: one per player and game day (`YYYY-MM-DD`) they opened the game. */
  logins: { day: string; playerId: string }[];
  /** Mission rows of the window. */
  missions: { day: string; missions: MissionProgress[] }[];
}

const DAY_MS = 86_400_000;
export const BALANCE_WINDOW_DAYS = 14;

/**
 * The thresholds of each verdict, and how much data it needs before it says anything. They come
 * from the casual-player simulation of the rebalance (see `shared/core/test/balance.spec.ts`).
 */
const THRESHOLDS: Record<
  BalanceInsightId,
  { good: number; bad: number; higherIsBetter: boolean; minSample: number }
> = {
  /** Share of Rascals among the adults that were well cared for. */
  rascal_cared: { good: 0.15, bad: 0.3, higherIsBetter: false, minSample: 5 },
  /** Illnesses per living pet and game day (simulation: ~0.1 for a player visiting twice a day). */
  illness_rate: { good: 0.1, bad: 0.2, higherIsBetter: false, minSample: 10 },
  /** Care mistakes per living pet and game day. */
  mistake_rate: { good: 0.5, bad: 1.5, higherIsBetter: false, minSample: 10 },
  /** Share of the wishes that were granted rather than left to fade. */
  wish_grant_rate: { good: 0.4, bad: 0.2, higherIsBetter: true, minSample: 20 },
  /** Share of the players' mission days with all three missions done. */
  missions_done: { good: 0.3, bad: 0.1, higherIsBetter: true, minSample: 10 },
  /** Share of the pets that ended in the window by leaving (neglect) rather than retiring. */
  departures: { good: 0.2, bad: 0.5, higherIsBetter: false, minSample: 3 },
  /** Daily players over weekly players, over the last 7 days. */
  stickiness: { good: 0.5, bad: 0.3, higherIsBetter: true, minSample: 5 },
};

/** Care mistakes per game day lived: the bounds of the "good" and "fair" buckets. */
export const CARE_BUCKETS = { good: 0.3, fair: 1 } as const;

const round = (value: number, digits = 3) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};
const zeros = <K extends string>(keys: readonly K[]) =>
  Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;

export function levelOf(
  value: number | null,
  { good, bad, higherIsBetter }: { good: number; bad: number; higherIsBetter: boolean },
): BalanceLevel {
  if (value === null) return 'unknown';
  if (higherIsBetter) return value >= good ? 'good' : value < bad ? 'bad' : 'watch';
  return value <= good ? 'good' : value > bad ? 'bad' : 'watch';
}

/** The balance overview of the admin: verdicts, then the figures behind them. Pure: no I/O. */
export function buildBalanceReport(input: BalanceInput): AdminBalance {
  const { now, rules, timezone } = input;
  const gameDay = gameHours(rules, 24);
  const windowStart = now - BALANCE_WINDOW_DAYS * DAY_MS;
  const days = lastDays(now, timezone);
  const series: BalanceDay[] = days.map((day) => ({
    day,
    activePlayers: 0,
    illnesses: 0,
    careMistakes: 0,
    wishesGranted: 0,
    missionPlayers: 0,
    missionsAllDone: 0,
  }));
  const bucket = (time: number) => series.find((d) => d.day === dayOf(time, timezone));

  const hatched = input.pets.filter((pet) => pet.stage !== 'egg');
  const living = hatched.filter((pet) => pet.status === 'alive');

  // Living pet-days of the window, in game days: what the illness and mistake rates divide by.
  const exposure =
    hatched.reduce((sum, pet) => {
      const from = Math.max(pet.bornAt, windowStart);
      const to = Math.min(pet.endedAt ?? now, now);
      return sum + Math.max(0, to - from);
    }, 0) / gameDay;

  const mistakesByNeed = zeros<Need>(NEEDS);
  const illnessesByKind = zeros<Illness>(ILLNESSES);
  const grantedByWish = zeros<WishId>(WISH_IDS);
  let illnesses = 0;
  let mistakes = 0;
  for (const event of input.events) {
    if (event.at < windowStart || event.at > now) continue;
    const day = bucket(event.at);
    if (event.kind === 'illness') {
      illnesses++;
      if (day) day.illnesses++;
      if (event.illness && event.illness in illnessesByKind) {
        illnessesByKind[event.illness as Illness]++;
      }
    } else if (event.kind === 'mistake') {
      mistakes++;
      if (day) day.careMistakes++;
      if (event.need && event.need in mistakesByNeed) mistakesByNeed[event.need as Need]++;
    } else {
      if (day) day.wishesGranted++;
      if (event.wish && event.wish in grantedByWish) grantedByWish[event.wish as WishId]++;
    }
  }

  const loginsByDay = new Map<string, Set<string>>();
  for (const login of input.logins) {
    if (!loginsByDay.has(login.day)) loginsByDay.set(login.day, new Set());
    loginsByDay.get(login.day)!.add(login.playerId);
  }
  for (const entry of series) entry.activePlayers = loginsByDay.get(entry.day)?.size ?? 0;
  const lastWeek = days.slice(-7);
  const weekly = new Set(lastWeek.flatMap((day) => [...(loginsByDay.get(day) ?? [])]));
  const dailyMean =
    lastWeek.reduce((sum, day) => sum + (loginsByDay.get(day)?.size ?? 0), 0) / lastWeek.length;

  const missions = new Map<MissionId, { offered: number; done: number }>(
    MISSION_IDS.map((id) => [id, { offered: 0, done: 0 }]),
  );
  let missionDays = 0;
  let missionDaysDone = 0;
  for (const row of input.missions) {
    const known = row.missions.filter((m) => m.id in MISSIONS);
    if (known.length === 0) continue;
    const allDone = known.every((m) => m.progress >= MISSIONS[m.id].target);
    missionDays++;
    if (allDone) missionDaysDone++;
    const day = series.find((d) => d.day === row.day);
    if (day) {
      day.missionPlayers++;
      if (allDone) day.missionsAllDone++;
    }
    for (const mission of known) {
      const tally = missions.get(mission.id)!;
      tally.offered++;
      if (mission.progress >= MISSIONS[mission.id].target) tally.done++;
    }
  }

  const daysLived = (pet: PetState) =>
    Math.max(1 / 24, ((pet.endedAt ?? now) - pet.bornAt) / gameDay);
  const careBuckets: CareBucket[] = (
    [
      ['good', CARE_BUCKETS.good],
      ['fair', CARE_BUCKETS.fair],
      ['poor', null],
    ] as const
  ).map(([key, below], index, all) => {
    const above = index === 0 ? 0 : all[index - 1]![1]!;
    const members = hatched.filter((pet) => {
      if (!pet.form) return false;
      const perDay = pet.careMistakes / daysLived(pet);
      return perDay >= above && (below === null || perDay < below);
    });
    const byForm = zeros<Form>(FORMS);
    for (const pet of members) byForm[pet.form!]++;
    return { key, below, pets: members.length, byForm };
  });

  const wishes = input.pets.reduce(
    (sum, pet) => ({
      granted: sum.granted + (pet.wishTally?.granted ?? 0),
      faded: sum.faded + (pet.wishTally?.faded ?? 0),
    }),
    { granted: 0, faded: 0 },
  );
  const ended = hatched.filter(
    (pet) => pet.status !== 'alive' && pet.endedAt !== null && pet.endedAt >= windowStart,
  );
  const goodCare = careBuckets[0]!;

  const measures: Record<BalanceInsightId, { value: number | null; sample: number }> = {
    rascal_cared: {
      value: goodCare.pets === 0 ? null : goodCare.byForm.rascal / goodCare.pets,
      sample: goodCare.pets,
    },
    illness_rate: { value: exposure === 0 ? null : illnesses / exposure, sample: exposure },
    mistake_rate: { value: exposure === 0 ? null : mistakes / exposure, sample: exposure },
    wish_grant_rate: {
      value:
        wishes.granted + wishes.faded === 0
          ? null
          : wishes.granted / (wishes.granted + wishes.faded),
      sample: wishes.granted + wishes.faded,
    },
    missions_done: {
      value: missionDays === 0 ? null : missionDaysDone / missionDays,
      sample: missionDays,
    },
    departures: {
      value:
        ended.length === 0 ? null : ended.filter((p) => p.status === 'gone').length / ended.length,
      sample: ended.length,
    },
    stickiness: { value: weekly.size === 0 ? null : dailyMean / weekly.size, sample: weekly.size },
  };

  const insights: BalanceInsight[] = (Object.keys(THRESHOLDS) as BalanceInsightId[]).map((id) => {
    const { minSample, ...threshold } = THRESHOLDS[id];
    const { value, sample } = measures[id];
    const enough = value !== null && sample >= minSample;
    return {
      id,
      level: enough ? levelOf(value, threshold) : 'unknown',
      value: value === null ? null : round(value),
      ...threshold,
      sample: Math.round(sample),
    };
  });

  return {
    generatedAt: now,
    windowDays: BALANCE_WINDOW_DAYS,
    insights,
    days: series,
    mistakesByNeed,
    illnessesByKind,
    careBuckets,
    wishes: { ...wishes, grantedByWish },
    missions: [...missions.entries()].map(([id, { offered, done }]) => ({
      id,
      offered,
      done,
      rate: offered === 0 ? null : round(done / offered),
    })),
    living: living.length,
    sickNow: living.filter((pet) => pet.sickSince !== null).length,
  };
}
