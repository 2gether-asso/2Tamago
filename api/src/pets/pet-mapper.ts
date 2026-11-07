import { alertsOf, moodOf, type PetEvent, type PetEventType } from '@2tamago/core';
import type { PetDto } from '@2tamago/core/contracts';
import type { PetRow } from '../database/schema.js';

export function toPetDto(row: PetRow, ownerName: string): PetDto {
  return {
    id: row.id,
    ownerId: row.ownerId,
    ownerName,
    state: row.state,
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
]);

export function notableEvents(events: PetEvent[]): PetEvent[] {
  return events.filter((event) => NOTABLE.has(event.type));
}
