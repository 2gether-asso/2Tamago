/**
 * Core data types of a pet. A `PetState` is a plain JSON-serializable object:
 * the API stores it as-is (JSONB column) and the web app receives it as-is.
 * All timestamps are epoch milliseconds (real time).
 */

import type { WalkZoneId } from './zones.js';

export const SPECIES = ['mochi', 'pyon', 'kumo', 'koro', 'nyao', 'toge'] as const;
export type Species = (typeof SPECIES)[number];

/** Personality, rolled once per pet. Each one nudges the rules with a pro and a con (see `traits.ts`). */
export const TEMPERAMENTS = ['greedy', 'sleepy', 'cuddly', 'prankster', 'tidy', 'sturdy'] as const;
export type Temperament = (typeof TEMPERAMENTS)[number];

/** Coat pattern and eye style: purely cosmetic. */
export const PATTERNS = ['plain', 'spots', 'stripes', 'gradient'] as const;
export type Pattern = (typeof PATTERNS)[number];
export const EYES = ['round', 'sleepy', 'sparkle', 'sly'] as const;
export type Eyes = (typeof EYES)[number];

export interface PetTraits {
  temperament: Temperament;
  pattern: Pattern;
  eyes: Eyes;
}

export const STAGES = ['egg', 'baby', 'child', 'teen', 'adult', 'elder'] as const;
export type Stage = (typeof STAGES)[number];

/** Evolution branch, decided at each stage change from the care received. */
export const FORMS = ['radiant', 'gentle', 'rascal'] as const;
export type Form = (typeof FORMS)[number];

/** Food groups of the diet: a balanced diet mixes the healthy ones and goes easy on sweets. */
export const FOOD_GROUPS = ['grain', 'veg', 'protein', 'fruit', 'sweet'] as const;
export type FoodGroup = (typeof FOOD_GROUPS)[number];

/** What a pet falls ill with, decided by what made it ill. Each has its own medicine. */
export const ILLNESSES = ['infection', 'indigestion', 'weakness'] as const;
export type Illness = (typeof ILLNESSES)[number];

export const TRICKS = ['sit', 'spin', 'jump', 'highfive'] as const;
export type TrickId = (typeof TRICKS)[number];

export type PetStatus = 'alive' | 'gone' | 'retired';

/** All stats are in [0, 100], higher is better. */
export interface Stats {
  /** 0 = starving. */
  satiety: number;
  happiness: number;
  energy: number;
  hygiene: number;
  health: number;
  discipline: number;
}

/** Neglect conditions that turn into a care mistake when they last too long. */
export const NEEDS = ['hunger', 'sadness', 'mess', 'sickness'] as const;
export type Need = (typeof NEEDS)[number];

export interface NeedTracker {
  since: number;
  counted: boolean;
}

export interface Outing {
  startedAt: number;
  endsAt: number;
  /** Where it went. Absent on walks that began before zones existed (the meadow). */
  zone?: WalkZoneId;
}

export interface PetState {
  /** Shape version, to migrate stored states when the shape changes. */
  v: 1;
  name: string;
  species: Species;
  /** Hue (0-359) used to tint the pet. */
  color: number;
  /**
   * Rolled at creation and revealed at hatching: the API leaves it out while the pet is an egg.
   * Also absent on pets created before traits existed: `simulate()` backfills it
   * deterministically once they have hatched.
   */
  traits?: PetTraits;

  status: PetStatus;
  stage: Stage;
  form: Form | null;
  bornAt: number;
  stageStartedAt: number;
  /** When the pet left (status `gone` or `retired`). */
  endedAt: number | null;

  /** Last simulation tick. Always aligned on the simulation grid (see `stepMs`). */
  simulatedAt: number;

  stats: Stats;
  /** Arbitrary unit, purely cosmetic for now (overweight raises sickness risk). */
  weight: number;
  /** Affection between the pet and its owner (Nintendogs-like), 0-100. */
  bond: number;

  asleep: boolean;
  poops: number;
  nextPoopAt: number;

  sickSince: number | null;
  /** What it suffers from. Absent (or null) on pets that fell ill before illnesses existed. */
  illness?: Illness | null;
  /** Doses received so far (a fraction for the free care, see `GameRules.medicineDoses`). */
  medicineDoses: number;
  /** The food groups of the latest meals and treats, oldest first (see `dietOf`). */
  diet?: FoodGroup[];
  /** Hours of exposure to sickness factors, see `sicknessThresholdHours`. */
  sicknessPressure: number;

  careMistakes: number;
  /** Care mistakes made during the current stage, used to pick the next form. */
  stageCareMistakes: number;
  needs: Record<Need, NeedTracker | null>;

  /** The pet is calling for attention without a real need (to scold). */
  tantrumSince: number | null;
  nextTantrumAt: number;

  outing: Outing | null;

  /** Training progress per trick, 0-100 (100 = mastered). */
  tricks: Record<TrickId, number>;
  lastCaressAt: number | null;

  equipped: string | null;

  /** The owner switched the lights off for the night. Absent (or false) = lights on. */
  lightsOff?: boolean;

  /**
   * Vacation: since when the pet is paused (the simulation stands still, and `simulate()` ends
   * it by itself after `vacationMaxHours`). Absent (or null) = not on vacation.
   */
  vacationSince?: number | null;
  /** When the last vacation ended, for the cooldown before the next one. */
  vacationEndedAt?: number | null;
}

export type PetEventType =
  | 'hatched'
  | 'evolved'
  | 'pooped'
  | 'fell_ill'
  | 'cured'
  | 'care_mistake'
  | 'fell_asleep'
  | 'woke_up'
  | 'attention_call'
  | 'attention_ignored'
  | 'trick_level_up'
  | 'departed'
  | 'retired'
  | 'vacation_started'
  | 'vacation_ended';

export interface PetEvent {
  type: PetEventType;
  at: number;
  data?: Record<string, string | number | boolean | null>;
}
