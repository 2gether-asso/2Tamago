import type { CaretakerActionType } from '@2tamago/core';

/** The rules of the daycare, in real time (it is about people's holidays, not the game's days). */
export const DAYCARE = {
  /** How long an invitation waits for an answer. */
  inviteHours: 48,
  /** A stay ends by itself after this long: nobody is left with a companion for good. */
  maxDays: 14,
  /** How many companions one member looks after at once. */
  maxCharges: 2,
  /** Coins per real care action (within the daily cap of play and training coins). */
  careReward: 2,
} as const;

/** The care that earns coins: what keeps the companion healthy, not what is just pleasant. */
export const REWARDED_CARE: ReadonlySet<CaretakerActionType> = new Set([
  'feed',
  'clean',
  'medicine',
]);

/** What the owner finds in their journal: everything but the caresses, which would flood it. */
export function isJournaled(action: CaretakerActionType): boolean {
  return action !== 'caress';
}

export const HOUR_MS = 3_600_000;
