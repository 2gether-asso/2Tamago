import type { Stage, Temperament } from './types.js';

/** The night of one stage: from `startHour` to `endHour` (hours of the game day, 0 to 23). */
export interface BedtimeWindow {
  startHour: number;
  endHour: number;
}

/** Rule multipliers a temperament can apply. Missing keys mean ×1. */
export interface TemperamentMods {
  satietyDecay: number;
  happinessDecay: number;
  energyDecay: number;
  hygieneDecay: number;
  /** Energy regained per hour while asleep. */
  energyRecovery: number;
  /** Health lost per hour while sick. */
  sickHealthLoss: number;
  /** Bond gained per caress. */
  caressBond: number;
  /** Delay between two tantrums (a lower value means more tantrums). */
  tantrumInterval: number;
}

/**
 * Every tunable number of the simulation. Durations are in *game hours*:
 * one game hour lasts `1 / timeScale` real hours, so `timeScale: 60` turns a
 * game day into 24 real minutes (handy in development).
 *
 * The API owns the rules and sends them to the web app (`GET /api/game/rules`),
 * so both sides run the exact same simulation.
 */
export interface GameRules {
  timeScale: number;
  /** Simulation resolution, in game minutes. */
  stepMinutes: number;

  /** How long each stage lasts. `null` = until the owner decides otherwise. */
  stageHours: Record<Stage, number | null>;
  /** Decay multiplier per stage (babies are needier). */
  stageNeediness: Record<Stage, number>;

  awakeDecayPerHour: { satiety: number; happiness: number; energy: number; hygiene: number };
  asleepDecayPerHour: { satiety: number; happiness: number; hygiene: number };
  energyRecoveryPerHour: number;
  disciplineDecayPerHour: number;
  hygieneLossPerPoopPerHour: number;

  poopIntervalHours: number;
  maxPoops: number;

  /** Hours of exposure to sickness factors before the pet falls ill. */
  sicknessThresholdHours: number;
  /**
   * Doses that cure a pet with no specific medicine: a syrup is worth 1, the free care
   * (`freeMedicineDose`) a fraction of it. The medicine of the right illness cures at once.
   */
  medicineDoses: number;
  /** What one free dose (no medicine in the bag) is worth, in doses. */
  freeMedicineDose: number;
  /** What a medicine for another illness is worth, in doses. */
  wrongMedicineDose: number;
  sickHealthLossPerHour: number;
  starvingHealthLossPerHour: number;
  healthRegenPerHour: number;
  overweightThreshold: number;

  /** Satiety the free ration gives (a meal from the bag gives its own, bigger, amount). */
  freeMealSatiety: number;
  /** Satiety above which the pet refuses a meal: it is full. */
  fullSatiety: number;
  /** Eating a treat while at or above `fullSatiety` makes it put on this much weight more. */
  overfeedWeight: number;
  /** How many of the latest meals and treats the diet balance looks at. */
  dietWindow: number;
  /** Health regeneration multiplier with a balanced diet. */
  balancedRegenFactor: number;

  /** A need left unattended for this long becomes a care mistake. */
  mistakeGraceHours: number;

  tantrumIntervalHours: number;
  tantrumWindowHours: number;

  outingHours: number;

  /** A vacation ends by itself after this long (game hours): the pet is not left frozen for good. */
  vacationMaxHours: number;
  /** After a vacation, this long (game hours) before the next one can start. */
  vacationCooldownHours: number;
  /** Minimum real seconds between two effective caresses. */
  caressCooldownSeconds: number;

  /**
   * When health reaches 0: `true` the pet leaves for good (status `gone`),
   * `false` it stays at 1 health point forever (a gentler mode).
   */
  departureEnabled: boolean;

  /**
   * What each temperament changes. The defaults give each one a pro and a con (a test enforces
   * it); an admin is free to break that. A multiplier cannot be removed by an override, only set
   * to 1.
   */
  temperaments: Record<Temperament, Partial<TemperamentMods>>;

  /**
   * The day/night cycle of the game clock (game hours, see `dayHour`). Between `startHour` and
   * `endHour` it is night; equal hours mean there is no night. Each stage can have its own
   * bedtime in `stages` (babies go to bed earlier than adults), the top-level hours apply to the
   * stages not listed. A pet awake at night with the lights on is restless: its happiness falls
   * `awakeHappinessFactor` times faster. With the lights off it goes to sleep, and stays asleep
   * until morning.
   */
  night: {
    startHour: number;
    endHour: number;
    /** Bedtime of each stage (the hours of the night as that stage lives it). */
    stages: Partial<Record<Stage, BedtimeWindow>>;
    /** Hours added to UTC to get the local hour (the API derives it from `GAME_TIMEZONE`). */
    clockOffsetHours: number;
    awakeHappinessFactor: number;
  };

  /** Safety cap on the number of steps simulated in one call. */
  maxStepsPerSimulation: number;
}

export const DEFAULT_RULES: GameRules = {
  timeScale: 1,
  stepMinutes: 5,

  stageHours: { egg: 0.1, baby: 12, child: 48, teen: 72, adult: 240, elder: null },
  stageNeediness: { egg: 0, baby: 1.5, child: 1.2, teen: 1, adult: 0.9, elder: 1.1 },

  awakeDecayPerHour: { satiety: 6, happiness: 5, energy: 6, hygiene: 3 },
  asleepDecayPerHour: { satiety: 2, happiness: 1, hygiene: 1 },
  energyRecoveryPerHour: 12,
  disciplineDecayPerHour: 0.5,
  hygieneLossPerPoopPerHour: 4,

  poopIntervalHours: 4,
  maxPoops: 4,

  sicknessThresholdHours: 2,
  medicineDoses: 2,
  freeMedicineDose: 0.5,
  wrongMedicineDose: 0.5,
  sickHealthLossPerHour: 1,
  starvingHealthLossPerHour: 1.5,
  healthRegenPerHour: 2,
  overweightThreshold: 40,

  freeMealSatiety: 20,
  fullSatiety: 80,
  overfeedWeight: 2,
  dietWindow: 6,
  balancedRegenFactor: 1.5,

  mistakeGraceHours: 1,

  tantrumIntervalHours: 10,
  tantrumWindowHours: 0.5,

  outingHours: 0.5,

  vacationMaxHours: 24 * 14,
  vacationCooldownHours: 24 * 7,
  caressCooldownSeconds: 15,

  departureEnabled: true,

  temperaments: {
    greedy: { satietyDecay: 1.3, happinessDecay: 0.85 },
    sleepy: { energyDecay: 1.3, energyRecovery: 1.3 },
    cuddly: { caressBond: 1.5, happinessDecay: 1.2 },
    prankster: { tantrumInterval: 0.7, satietyDecay: 0.85 },
    tidy: { hygieneDecay: 0.7, energyDecay: 1.15 },
    sturdy: { sickHealthLoss: 0.7, satietyDecay: 1.15 },
  },

  night: {
    startHour: 21,
    endHour: 7,
    stages: {
      baby: { startHour: 19, endHour: 8 },
      child: { startHour: 20, endHour: 7 },
      teen: { startHour: 21, endHour: 7 },
      adult: { startHour: 22, endHour: 7 },
      elder: { startHour: 21, endHour: 8 },
    },
    clockOffsetHours: 0,
    awakeHappinessFactor: 1.5,
  },

  maxStepsPerSimulation: 200_000,
};

export function withRules(overrides: Partial<GameRules> = {}): GameRules {
  return { ...DEFAULT_RULES, ...overrides };
}

/** Rules that cannot change while pets live: they would rewrite every pet's timeline. */
export type FixedRuleKey = 'timeScale' | 'stepMinutes' | 'maxStepsPerSimulation';

/**
 * Tunings an admin may change at runtime. Object-valued rules are overridden key by key, so
 * `{ stageHours: { baby: 6 } }` keeps the other stages as they are.
 */
export type RulesOverrides = {
  [K in Exclude<keyof GameRules, FixedRuleKey>]?: DeepPartial<GameRules[K]>;
};

type DeepPartial<T> = T extends object ? { [P in keyof T]?: DeepPartial<T[P]> } : T;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Merges `override` into `base` key by key, at any depth. Other values replace. */
function merge(base: unknown, override: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(override)) return override;
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value !== undefined) merged[key] = merge(base[key], value);
  }
  return merged;
}

/** `base` with the overrides applied (pure: `base` is left untouched). */
export function applyRulesOverrides(base: GameRules, overrides: RulesOverrides): GameRules {
  return merge(base, overrides) as GameRules;
}

const HOUR_MS = 3_600_000;

/** Real milliseconds in `hours` game hours. */
export function gameHours(rules: GameRules, hours: number): number {
  return (hours * HOUR_MS) / rules.timeScale;
}

/** Real milliseconds between two simulation ticks. */
export function stepMs(rules: GameRules): number {
  return gameHours(rules, rules.stepMinutes / 60);
}

/** Last grid tick at or before `time`. */
export function alignToGrid(rules: GameRules, time: number): number {
  const step = stepMs(rules);
  return Math.floor(time / step) * step;
}
