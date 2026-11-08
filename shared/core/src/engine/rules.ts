import type { Stage } from './types.js';

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
  medicineDoses: number;
  sickHealthLossPerHour: number;
  starvingHealthLossPerHour: number;
  healthRegenPerHour: number;
  overweightThreshold: number;

  /** A need left unattended for this long becomes a care mistake. */
  mistakeGraceHours: number;

  tantrumIntervalHours: number;
  tantrumWindowHours: number;

  outingHours: number;
  /** Minimum real seconds between two effective caresses. */
  caressCooldownSeconds: number;

  /**
   * When health reaches 0: `true` the pet leaves for good (status `gone`),
   * `false` it stays at 1 health point forever (a gentler mode).
   */
  departureEnabled: boolean;

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
  sickHealthLossPerHour: 1,
  starvingHealthLossPerHour: 1.5,
  healthRegenPerHour: 2,
  overweightThreshold: 40,

  mistakeGraceHours: 1,

  tantrumIntervalHours: 10,
  tantrumWindowHours: 0.5,

  outingHours: 0.5,
  caressCooldownSeconds: 15,

  departureEnabled: true,

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
  [K in Exclude<keyof GameRules, FixedRuleKey>]?: GameRules[K] extends object
    ? Partial<GameRules[K]>
    : GameRules[K];
};

/** `base` with the overrides applied (pure: `base` is left untouched). */
export function applyRulesOverrides(base: GameRules, overrides: RulesOverrides): GameRules {
  const rules: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) continue;
    const current = rules[key];
    rules[key] =
      typeof value === 'object' && value !== null && typeof current === 'object'
        ? { ...current, ...value }
        : value;
  }
  return rules as unknown as GameRules;
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
