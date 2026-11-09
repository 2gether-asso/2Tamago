import { TRICKS, type PetState } from './types.js';

/**
 * Weekly contests. `tricks`: the entry's score is how much its pet has learned, when it enters.
 * `beauty`: the community votes. Both are ranked, and the best of each can take a prize.
 */
export const CONTEST_KINDS = ['tricks', 'beauty'] as const;
export type ContestKind = (typeof CONTEST_KINDS)[number];

/** Coins for the first, second and third of a contest. */
export const CONTEST_PRIZES = [50, 30, 15] as const;

/** How many entries a leaderboard shows. */
export const CONTEST_BOARD_SIZE = 20;

/** What the pet has learned: its progress in every trick added up (0 to 100 for each). */
export function trickScore(state: PetState): number {
  return Math.round(TRICKS.reduce((total, trick) => total + (state.tricks[trick] ?? 0), 0));
}

export type ContestProblem = 'pet_gone' | 'still_an_egg' | 'too_young' | 'on_vacation';

/** Why this pet cannot enter a contest right now (null: it can). */
export function contestProblem(kind: ContestKind, state: PetState): ContestProblem | null {
  if (state.status !== 'alive') return 'pet_gone';
  if (state.stage === 'egg') return 'still_an_egg';
  // Babies cannot be trained: they would only enter with nothing.
  if (kind === 'tricks' && state.stage === 'baby') return 'too_young';
  // Paused: it can neither learn nor be seen.
  if (state.vacationSince != null) return 'on_vacation';
  return null;
}

export interface Ranked {
  score: number;
  /** When it entered (epoch ms): of equal scores, the first to enter ranks first. */
  enteredAt: number;
}

/** Entries from first to last, with their rank (1 for the best): no two share a rank. */
export function rankEntries<T extends Ranked>(entries: readonly T[]): (T & { rank: number })[] {
  return [...entries]
    .sort((a, b) => b.score - a.score || a.enteredAt - b.enteredAt)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

/** The coins for a rank (0 below the podium). */
export function prizeFor(rank: number): number {
  return CONTEST_PRIZES[rank - 1] ?? 0;
}
