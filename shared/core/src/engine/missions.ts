import type { ItemId } from './catalog.js';
import { hashSeed, prng } from './traits.js';
import { STAGES, type Stage } from './types.js';

/**
 * Daily missions: three small goals a day, picked for each player, that take a few minutes spread
 * over the day. Each one done pays coins; all three open a present. Pure: the server keeps the
 * progress (one row per player and day) and feeds it the signals of what the player did.
 */

/** What the server reports when the player does something that missions may count. */
export const MISSION_SIGNALS = [
  'play',
  'train',
  'caress',
  'meal',
  'treat',
  'walk',
  'wish',
  'visit',
  'gift',
  'pet_work',
] as const;
export type MissionSignal = (typeof MISSION_SIGNALS)[number];

export interface MissionDef {
  signal: MissionSignal;
  target: number;
  /** The pet must have reached this stage when the day's missions are picked. */
  minStage?: Stage;
}

/** The ids are texts of the web app (`mission.<id>`). */
export const MISSIONS = {
  play_games: { signal: 'play', target: 2 },
  train_tricks: { signal: 'train', target: 3, minStage: 'child' },
  cuddles: { signal: 'caress', target: 5 },
  proper_meal: { signal: 'meal', target: 1 },
  sweet_treat: { signal: 'treat', target: 1 },
  go_walk: { signal: 'walk', target: 1, minStage: 'child' },
  two_walks: { signal: 'walk', target: 2, minStage: 'teen' },
  grant_wish: { signal: 'wish', target: 1 },
  visit_friend: { signal: 'visit', target: 1 },
  friend_gift: { signal: 'gift', target: 1 },
  pet_job: { signal: 'pet_work', target: 1, minStage: 'child' },
} as const satisfies Record<string, MissionDef>;
export type MissionId = keyof typeof MISSIONS;
export const MISSION_IDS = Object.keys(MISSIONS) as MissionId[];

export const MISSION_REWARD = {
  /** Paid as each mission is done. */
  coins: 10,
  /** Paid when the present of the day (all three missions done) is opened, with an item. */
  bonusCoins: 15,
  /** What the present may hold. */
  presents: [
    'strawberry',
    'warm_milk',
    'cake',
    'grilled_fish',
    'fruit_salad',
    'veggie_stew',
  ] as const satisfies readonly ItemId[],
} as const;

export const MISSIONS_PER_DAY = 3;

/**
 * The missions of a day, from a seed (the player and the day): three of them, about three
 * different things, and only what the pet can do at its stage. Pure.
 */
export function pickMissions(seed: string, stage: Stage): MissionId[] {
  const next = prng(hashSeed(`missions:${seed}`));
  const reached = STAGES.indexOf(stage);
  const pool = MISSION_IDS.filter((id) => {
    const min = (MISSIONS[id] as MissionDef).minStage;
    return min === undefined || reached >= STAGES.indexOf(min);
  });
  const picked: MissionId[] = [];
  while (picked.length < MISSIONS_PER_DAY && pool.length > 0) {
    const id = pool.splice(Math.floor(next() * pool.length), 1)[0]!;
    if (picked.some((other) => MISSIONS[other].signal === MISSIONS[id].signal)) continue;
    picked.push(id);
  }
  return picked;
}

export interface MissionProgress {
  id: MissionId;
  progress: number;
}

/**
 * Counts a signal towards the day's missions. Returns the new progress and the missions that it
 * completed (to pay them once). Pure: `missions` is left untouched.
 */
export function countMission(
  missions: readonly MissionProgress[],
  signal: MissionSignal,
  amount = 1,
): { missions: MissionProgress[]; completed: MissionId[] } {
  const completed: MissionId[] = [];
  const next = missions.map((mission) => {
    const def = MISSIONS[mission.id];
    if (!def || def.signal !== signal || mission.progress >= def.target) return mission;
    const progress = Math.min(def.target, mission.progress + amount);
    if (progress >= def.target) completed.push(mission.id);
    return { ...mission, progress };
  });
  return { missions: next, completed };
}

export function allMissionsDone(missions: readonly MissionProgress[]): boolean {
  return missions.length > 0 && missions.every((m) => m.progress >= (MISSIONS[m.id]?.target ?? 0));
}

/** The item of the day's present, from a random number in [0, 1) the server draws. */
export function missionPresent(random: number): ItemId {
  const { presents } = MISSION_REWARD;
  return presents[Math.min(presents.length - 1, Math.floor(random * presents.length))]!;
}
