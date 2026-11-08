import { alertsOf, type PetState } from '@2tamago/core';
import type { PushKind } from '@2tamago/core/contracts';

/**
 * What is worth a notification right now, for a pet already brought up to date: a walk that is
 * over, sickness, a tantrum (it lasts only a short while) and hunger. The rest (boredom, mess…)
 * can wait for the next visit. A sleeping pet is never worth waking its owner for.
 */
export function pushKindsOf(state: PetState, now: number): PushKind[] {
  if (state.status !== 'alive' || state.stage === 'egg' || state.asleep) return [];
  if (state.outing) return now >= state.outing.endsAt ? ['walk_done'] : [];
  const alerts = alertsOf(state);
  const kinds: PushKind[] = [];
  if (alerts.includes('sick')) kinds.push('sick');
  if (alerts.includes('calling')) kinds.push('calling');
  if (alerts.includes('hungry')) kinds.push('hungry');
  return kinds;
}
