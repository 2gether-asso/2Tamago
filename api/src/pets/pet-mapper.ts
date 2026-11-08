import { alertsOf, moodOf, type PetEvent, type PetEventType, type PetState } from '@2tamago/core';
import type { PetDto } from '@2tamago/core/contracts';
import type { PetRow } from '../database/schema.js';

/** An egg does not reveal its traits (coat, eyes, temperament): they are a surprise at hatching. */
export function concealUnhatched(state: PetState): PetState {
  if (state.stage !== 'egg') return state;
  const copy = { ...state };
  delete copy.traits;
  return copy;
}

export function toPetDto(row: PetRow, ownerName: string): PetDto {
  return {
    id: row.id,
    ownerId: row.ownerId,
    ownerName,
    state: concealUnhatched(row.state),
    mood: moodOf(row.state),
    alerts: alertsOf(row.state),
  };
}

/** Pet events worth a line in the owner's activity feed. */
const NOTABLE: ReadonlySet<PetEventType> = new Set([
  'hatched',
  'evolved',
  'fell_ill',
  'cured',
  'care_mistake',
  'trick_level_up',
  'departed',
  'retired',
  'vacation_ended',
]);

export function notableEvents(events: PetEvent[]): PetEvent[] {
  return events.filter((event) => NOTABLE.has(event.type));
}
