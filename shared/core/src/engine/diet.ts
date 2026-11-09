import type { FoodGroup, PetState } from './types.js';
import type { GameRules } from './rules.js';

export type DietStatus = 'balanced' | 'neutral' | 'unbalanced';

/** Healthy groups seen among the latest meals for the diet to be balanced. */
const BALANCED_GROUPS = 3;

/**
 * How the pet eats lately, from the groups of its last `rules.dietWindow` meals and treats:
 * balanced (at least 3 different healthy groups, and no more than a third of sweets),
 * unbalanced (mostly sweets), or neutral (not enough meals to tell, or just not varied).
 */
export function dietOf(state: Pick<PetState, 'diet'>, rules: GameRules): DietStatus {
  const recent = (state.diet ?? []).slice(-rules.dietWindow);
  const sweets = recent.filter((group) => group === 'sweet').length;
  const healthy = new Set(recent.filter((group) => group !== 'sweet')).size;
  if (recent.length >= 4 && sweets * 2 > recent.length) return 'unbalanced';
  if (healthy >= BALANCED_GROUPS && sweets * 3 <= recent.length) return 'balanced';
  return 'neutral';
}

/** Records what was just eaten, keeping only the latest `rules.dietWindow`. */
export function recordMeal(state: PetState, group: FoodGroup, rules: GameRules): void {
  state.diet = [...(state.diet ?? []), group].slice(-rules.dietWindow);
}
