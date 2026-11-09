import { hashSeed } from './traits.js';
import { TRICKS, type PetState } from './types.js';

/**
 * Work: how members (and their companion) earn coins on top of the daily bonus. Pure: the server
 * checks the cooldowns and supplies the randomness (a seed), the engine only computes.
 */
export const WORK = {
  /** Hours between two jobs of the player (skill game). */
  playerCooldownHours: 1,
  /** Hours between two jobs of the companion. */
  petCooldownHours: 2,
  /** Questions of the skill game: the score goes from 0 to this. */
  rounds: 5,
  /** Coins per right answer. */
  coinsPerPoint: 2,
  /** Smallest and largest wage of the companion (before the luck, which can go a bit beyond). */
  petBaseMin: 2,
  petBaseMax: 8,
  /** The luck scales the wage from `1 - luckSpread` to `1 + luckSpread`. */
  luckSpread: 0.5,
  /** What a job costs the companion. */
  petCost: { energy: 25, satiety: 10, happiness: 5, hygiene: 5 },
  /** Energy and satiety it needs to start. */
  petMinEnergy: 30,
  petMinSatiety: 30,
} as const;

/** Coins for a skill game score (clamped to the number of rounds). */
export function playerWage(score: number): number {
  const points = Math.max(0, Math.min(WORK.rounds, Math.round(score)));
  return points * WORK.coinsPerPoint;
}

/**
 * How good a companion is at working, from 0 to 1: what it has learned (tricks), its discipline,
 * its bond with its owner and its mood. Older companions are steadier.
 */
export function petAbility(state: PetState): number {
  const learning =
    TRICKS.reduce((total, trick) => total + (state.tricks[trick] ?? 0), 0) / (TRICKS.length * 100);
  const discipline = state.stats.discipline / 100;
  const bond = state.bond / 100;
  const mood = state.stats.happiness / 100;
  const maturity = state.stage === 'adult' || state.stage === 'elder' ? 1 : 0.6;
  const raw = 0.4 * learning + 0.25 * discipline + 0.2 * bond + 0.15 * mood;
  return Math.max(0, Math.min(1, raw * maturity + (1 - maturity) * 0.1));
}

/** A number in [0, 1) from a seed: same seed, same number, on every machine. */
export function workLuck(seed: number): number {
  return hashSeed(`work:${seed >>> 0}`) / 4294967296;
}

/** Coins a companion earns for one job, depending on its ability and on the luck of the seed. */
export function petWage(state: PetState, seed: number): number {
  const base = WORK.petBaseMin + petAbility(state) * (WORK.petBaseMax - WORK.petBaseMin);
  const luck = 1 - WORK.luckSpread + workLuck(seed) * 2 * WORK.luckSpread;
  return Math.max(1, Math.round(base * luck));
}
