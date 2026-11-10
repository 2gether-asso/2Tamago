import { gainXp } from './rpg.js';
import { TRICKS, type Form, type PetState, type Species } from './types.js';

/** What a retired companion hands down to the next egg. */
export type HeirloomBonus =
  /** A bond already started with its owner. */
  | 'bond'
  /** A head start on every trick. */
  | 'tricks'
  /** A little luck on walks. */
  | 'luck';

/** The bonus each form hands down: a radiant one a bond, a gentle one manners, a rascal luck. */
export const HEIRLOOM_BONUS: Record<Form, HeirloomBonus> = {
  radiant: 'bond',
  gentle: 'tricks',
  rascal: 'luck',
};

export const HEIRLOOM = {
  /** Bond the egg starts with (of 100). */
  bond: 20,
  /** Progress on each trick (of 100). */
  trickProgress: 20,
  /** Experience in the luck statistic: two points (see `XP_PER_POINT`). */
  luckXp: 20,
} as const;

/** The egg a retired companion leaves, until its owner adopts the next one. */
export interface Heirloom {
  /** The retired companion's name. */
  from: string;
  species: Species;
  form: Form;
  bonus: HeirloomBonus;
}

/**
 * What a companion leaves when it retires, or `null`: only a retirement hands anything down (one
 * that leaves on its own does not), and only a companion that took a form.
 */
export function heirloomOf(state: PetState): Heirloom | null {
  if (state.status !== 'retired' || !state.form) return null;
  return {
    from: state.name,
    species: state.species,
    form: state.form,
    bonus: HEIRLOOM_BONUS[state.form],
  };
}

/** Gives a fresh egg what the heirloom hands down. */
export function applyHeirloom(state: PetState, heirloom: Heirloom): void {
  switch (heirloom.bonus) {
    case 'bond':
      state.bond = Math.min(100, state.bond + HEIRLOOM.bond);
      break;
    case 'tricks':
      for (const trick of TRICKS) {
        state.tricks[trick] = Math.min(100, state.tricks[trick] + HEIRLOOM.trickProgress);
      }
      break;
    case 'luck':
      gainXp(state, 'luck', HEIRLOOM.luckXp, state.bornAt, []);
      break;
  }
}
