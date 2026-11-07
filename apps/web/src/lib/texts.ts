import {
  ITEMS,
  TRICK_LABELS,
  type ItemId,
  type PetEvent,
  type Stage,
  type TrickId,
} from '@2tamago/core';
import type { Alert, Form, Mood } from '@2tamago/core';
import type { ActivityDto } from '@2tamago/core/contracts';

/** French texts of the game. */

export const STAGE_LABELS: Record<Stage, string> = {
  egg: 'Œuf',
  baby: 'Bébé',
  child: 'Enfant',
  teen: 'Ado',
  adult: 'Adulte',
  elder: 'Ancien',
};

export const FORM_LABELS: Record<Form, string> = {
  radiant: 'Rayonnant',
  gentle: 'Doux',
  rascal: 'Chenapan',
};

export const MOOD_LABELS: Record<Mood, string> = {
  egg: 'Dans son œuf',
  gone: 'Parti',
  retired: 'À la retraite',
  away: 'En promenade',
  sleeping: 'Dort',
  sick: 'Malade',
  sad: 'Triste',
  calling: 'Réclame de l’attention',
  ok: 'Ça va',
  happy: 'Joyeux',
};

export const ALERT_LABELS: Record<Alert, string> = {
  hungry: 'A faim',
  bored: 'S’ennuie',
  tired: 'Fatigué',
  dirty: 'Sale',
  poop: 'Caca à nettoyer',
  sick: 'Malade',
  calling: 'Fait un caprice',
};

export function eventText(event: PetEvent, name: string): string | null {
  switch (event.type) {
    case 'hatched':
      return `${name} est sorti de son œuf !`;
    case 'evolved':
      return `${name} a grandi : ${STAGE_LABELS[event.data?.to as Stage] ?? ''} !`;
    case 'fell_ill':
      return `${name} est tombé malade.`;
    case 'cured':
      return `${name} est guéri !`;
    case 'care_mistake':
      return `${name} s’est senti délaissé…`;
    case 'fell_asleep':
      return event.data?.exhausted ? `${name} s’est endormi d’épuisement.` : `Bonne nuit ${name}.`;
    case 'woke_up':
      return `${name} est réveillé.`;
    case 'attention_call':
      return `${name} fait un caprice !`;
    case 'trick_level_up':
      return `${name} progresse en « ${TRICK_LABELS[event.data?.trick as TrickId]} » !`;
    case 'departed':
      return `${name} est parti…`;
    case 'retired':
      return `${name} part couler des jours paisibles.`;
    default:
      return null;
  }
}

export function activityText(entry: ActivityDto): string {
  const d = entry.data as Record<string, string | number>;
  switch (entry.kind) {
    case 'daily_bonus':
      return `Bonus du jour : +${d.coins} pièces.`;
    case 'visit_caress':
      return `${d.visitorName} est passé caresser ${d.petName}.`;
    case 'visit_gift':
      return `${d.visitorName} a offert ${ITEMS[d.item as ItemId]?.label ?? 'un cadeau'} à ${d.petName}.`;
    case 'encounter':
      return `Rencontre en promenade avec ${d.otherPetName} (${d.otherOwnerName}).`;
    case 'pet_event':
      return (
        eventText({ type: d.event as PetEvent['type'], at: 0, data: d }, String(d.petName)) ??
        String(d.event)
      );
  }
}
