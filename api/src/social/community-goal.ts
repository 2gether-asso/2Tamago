/** The weekly goal of the village, in walks, and what taking part earns. */
export const GOAL = {
  /** However few players there are, the goal is never lower than this. */
  minWalks: 10,
  /** Walks asked per living companion, so that the goal follows the size of the community. */
  walksPerPet: 5,
  /** Coins for each player with at least one walk that week. */
  reward: 25,
} as const;

/** The target of a week, fixed when the week's first visitor asks, from the living companions. */
export function targetFor(livingPets: number): number {
  return Math.max(GOAL.minWalks, livingPets * GOAL.walksPerPet);
}
