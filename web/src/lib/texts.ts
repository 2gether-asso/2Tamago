import {
  ITEMS,
  type Alert,
  type Form,
  type ItemId,
  type Mood,
  type PetEvent,
  type Stage,
  type Temperament,
  type TrickId,
} from '@2tamago/core';
import type { ActivityDto, Notice } from '@2tamago/core/contracts';
import { t } from './i18n/index.svelte.ts';

/** Texts of the game, in the current language (see `lib/i18n`). */

export const stageLabel = (stage: Stage) => t(`stage.${stage}`);
export const formLabel = (form: Form) => t(`form.${form}`);
export const moodLabel = (mood: Mood) => t(`mood.${mood}`);
export const alertLabel = (alert: Alert) => t(`alert.${alert}`);
export const trickLabel = (trick: TrickId) => t(`trick.${trick}`);
export const temperamentLabel = (temperament: Temperament) => t(`temperament.${temperament}`);
export const temperamentHint = (temperament: Temperament) => t(`temperament.${temperament}.hint`);
export const itemLabel = (id: ItemId) => t(`item.${id}`);

export function eventText(event: PetEvent, name: string): string | null {
  switch (event.type) {
    case 'hatched': {
      const temperament = event.data?.temperament as Temperament | undefined;
      return temperament
        ? t('event.hatched_temperament', {
            name,
            temperament: temperamentLabel(temperament).toLowerCase(),
          })
        : t('event.hatched', { name });
    }
    case 'evolved':
      return t('event.evolved', { name, stage: stageLabel(event.data?.to as Stage) });
    case 'fell_asleep':
      return event.data?.exhausted
        ? t('event.fell_asleep_exhausted', { name })
        : t('event.fell_asleep', { name });
    case 'trick_level_up':
      return t('event.trick_level_up', { name, trick: trickLabel(event.data?.trick as TrickId) });
    case 'fell_ill':
    case 'cured':
    case 'care_mistake':
    case 'woke_up':
    case 'attention_call':
    case 'departed':
    case 'retired':
      return t(`event.${event.type}`, { name });
    default:
      return null;
  }
}

export function activityText(entry: ActivityDto): string {
  const d = entry.data as Record<string, string | number>;
  switch (entry.kind) {
    case 'daily_bonus':
      return t('activity.daily_bonus', { count: Number(d.coins) });
    case 'visit_caress':
      return t('activity.visit_caress', {
        visitorName: String(d.visitorName),
        petName: String(d.petName),
      });
    case 'visit_gift':
      return t('activity.visit_gift', {
        visitorName: String(d.visitorName),
        item: String(d.item) in ITEMS ? itemLabel(d.item as ItemId) : t('item.unknown'),
        petName: String(d.petName),
      });
    case 'community_reward':
      return t('activity.community_reward', { count: Number(d.coins) });
    case 'encounter':
      return t('activity.encounter', {
        otherPetName: String(d.otherPetName),
        otherOwnerName: String(d.otherOwnerName),
      });
    case 'pet_event':
      return (
        eventText({ type: d.event as PetEvent['type'], at: 0, data: d }, String(d.petName)) ??
        String(d.event)
      );
  }
}

export function noticeText(notice: Notice): string {
  switch (notice.code) {
    case 'coins_earned':
    case 'walk_found_coins':
      return t(`notice.${notice.code}`, { count: notice.count });
    case 'pet_happy':
      return t('notice.pet_happy', { petName: notice.petName });
    case 'gift_given':
      return t('notice.gift_given', { item: itemLabel(notice.item), petName: notice.petName });
    case 'walk_found_item':
      return t('notice.walk_found_item', { item: itemLabel(notice.item) });
    case 'walk_met':
      return t('notice.walk_met', { petName: notice.petName, ownerName: notice.ownerName });
  }
}
