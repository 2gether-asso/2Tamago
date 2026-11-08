import { gameHours, type GameRules } from './rules.js';
import type { PetState } from './types.js';

export type Mood =
  | 'egg'
  | 'gone'
  | 'retired'
  | 'vacation'
  | 'away'
  | 'sleeping'
  | 'sick'
  | 'sad'
  | 'calling'
  | 'ok'
  | 'happy';

export type Alert = 'hungry' | 'bored' | 'tired' | 'dirty' | 'poop' | 'sick' | 'calling';

/** One word summary of how the pet feels, for the UI. */
export function moodOf(state: PetState): Mood {
  if (state.status === 'gone') return 'gone';
  if (state.status === 'retired') return 'retired';
  if (state.stage === 'egg') return 'egg';
  if (state.vacationSince != null) return 'vacation';
  if (state.outing) return 'away';
  if (state.asleep) return 'sleeping';
  if (state.sickSince !== null) return 'sick';
  if (state.tantrumSince !== null) return 'calling';
  const s = state.stats;
  const low = Math.min(s.satiety, s.happiness, s.hygiene);
  if (low < 25) return 'sad';
  if (s.happiness >= 70 && s.satiety >= 50) return 'happy';
  return 'ok';
}

/** What the owner should take care of now. */
export function alertsOf(state: PetState): Alert[] {
  if (state.status !== 'alive' || state.stage === 'egg' || state.outing) return [];
  if (state.vacationSince != null) return [];
  const s = state.stats;
  const alerts: Alert[] = [];
  if (state.sickSince !== null) alerts.push('sick');
  if (s.satiety < 30) alerts.push('hungry');
  if (s.happiness < 30) alerts.push('bored');
  if (!state.asleep && s.energy < 20) alerts.push('tired');
  if (state.poops > 0) alerts.push('poop');
  if (s.hygiene < 30) alerts.push('dirty');
  if (state.tantrumSince !== null) alerts.push('calling');
  return alerts;
}

/** Age in game days. */
export function ageInDays(state: PetState, now: number, rules: GameRules): number {
  const end = state.endedAt ?? now;
  return Math.max(0, Math.floor((end - state.bornAt) / gameHours(rules, 24)));
}
