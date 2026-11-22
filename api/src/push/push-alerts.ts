import {
  alertsOf,
  birthdayToCelebrate,
  presentReady,
  type GameRules,
  type PetState,
} from '@2tamago/core';
import type { PushKind } from '@2tamago/core/contracts';

/**
 * What is worth a notification right now, for a pet already brought up to date: a walk that is
 * over, sickness, a tantrum (it lasts only a short while) and hunger. The rest (boredom, mess…)
 * can wait for the next visit. A sleeping pet is never worth waking its owner for, nor one on vacation.
 */
export function pushKindsOf(state: PetState, now: number, rules?: GameRules): PushKind[] {
  if (state.status !== 'alive' || state.stage === 'egg' || state.asleep) return [];
  // Paused: nothing is going on, and the owner is away on purpose.
  if (state.vacationSince != null) return [];
  if (state.outing) return now >= state.outing.endsAt ? ['walk_done'] : [];
  const alerts = alertsOf(state);
  const kinds: PushKind[] = [];
  if (alerts.includes('sick')) kinds.push('sick');
  if (alerts.includes('calling')) kinds.push('calling');
  if (alerts.includes('hungry')) kinds.push('hungry');
  // Good news too, so that the phone is not only a list of chores (sent when it is awake).
  if (rules && presentReady(state, now, rules)) kinds.push('present');
  if (rules && birthdayToCelebrate(state, now, rules)) kinds.push('birthday');
  return kinds;
}
