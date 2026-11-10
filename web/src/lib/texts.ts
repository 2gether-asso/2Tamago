import {
  bundleEntries,
  ITEMS,
  WEATHER_EFFECTS,
  type Alert,
  type Form,
  type ItemId,
  type Mood,
  type PetEvent,
  type RpgStat,
  type Stage,
  type Temperament,
  type TrickId,
  type WalkEventId,
  type Weather,
  type WalkZoneId,
} from '@2tamago/core';
import type { ActivityDto, Notice } from '@2tamago/core/contracts';
import { intlTag, t, type MessageKey } from './i18n/index.svelte.ts';

/** Texts of the game, in the current language (see `lib/i18n`). */

export const stageLabel = (stage: Stage) => t(`stage.${stage}`);
export const formLabel = (form: Form) => t(`form.${form}`);
export const moodLabel = (mood: Mood) => t(`mood.${mood}`);
export const alertLabel = (alert: Alert) => t(`alert.${alert}`);
export const trickLabel = (trick: TrickId) => t(`trick.${trick}`);
export const temperamentLabel = (temperament: Temperament) => t(`temperament.${temperament}`);
export const temperamentHint = (temperament: Temperament) => t(`temperament.${temperament}.hint`);
export const zoneLabel = (zone: WalkZoneId) => t(`zone.${zone}`);
export const zoneHint = (zone: WalkZoneId) => t(`zone.${zone}.hint`);
export const weatherLabel = (weather: Weather) => t(`weather.${weather}`);
/** What the weather changes about a walk, with the numbers of the rules. */
export const weatherHint = (weather: Weather) => {
  const effect = WEATHER_EFFECTS[weather];
  // ×1,5 in French, ×1.5 in English.
  const number = new Intl.NumberFormat(intlTag());
  return t(`weather.${weather}.hint`, {
    coins: number.format(effect.coinsPercent),
    items: number.format(effect.itemChanceFactor),
    energy: number.format(effect.energyExtra),
  });
};
/** A small picture for each weather. */
export const WEATHER_ICON: Record<Weather, string> = {
  sunny: '☀️',
  cloudy: '☁️',
  rain: '🌧️',
  wind: '💨',
};
/** "Cookie ×2, Mushroom ×1": what a trade is about, or nothing if the side is empty. */
export function bundleLabel(items: Partial<Record<ItemId, number>>): string {
  return bundleEntries(items)
    .map(([id, quantity]) => `${t(`item.${id}`)} ×${quantity}`)
    .join(', ');
}
/** An item bundle and coins: "Cookie ×2, 30 coins". Empty when there is nothing. */
export function tradeSideLabel(items: Partial<Record<ItemId, number>>, coins: number): string {
  return [bundleLabel(items), ...(coins > 0 ? [t('trade.coins', { count: coins })] : [])]
    .filter(Boolean)
    .join(', ');
}
export const itemLabel = (id: ItemId) => t(`item.${id}`);

/** The story of a walk event (`rpg.event.<id>`). */
export const walkEventText = (id: WalkEventId, name: string) => t(`rpg.event.${id}`, { name });

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
    case 'vacation_ended':
      return t(event.data?.automatic ? 'event.vacation_ended_auto' : 'event.vacation_ended', {
        name,
      });
    case 'trick_level_up':
      return t('event.trick_level_up', { name, trick: trickLabel(event.data?.trick as TrickId) });
    case 'walk_event':
      return walkEventText(event.data?.walk as WalkEventId, name);
    case 'stat_up':
      return t('event.stat_up', {
        name,
        stat: t(`rpg.stat.${event.data?.stat as RpgStat}`),
        value: Number(event.data?.value),
      });
    case 'fell_ill':
    case 'cured':
    case 'care_mistake':
    case 'woke_up':
    case 'attention_call':
    case 'departed':
    case 'retired':
    case 'vacation_started':
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
    case 'trade_offer':
    case 'trade_accepted':
    case 'trade_declined':
    case 'trade_expired':
      return t(`activity.${entry.kind}`, { playerName: String(d.playerName) });
    case 'wish_request':
      return t('activity.wish_request', {
        playerName: String(d.playerName),
        item: String(d.item) in ITEMS ? itemLabel(d.item as ItemId) : t('item.unknown'),
      });
    case 'name_changed':
      return t(d.what === 'pet' ? 'activity.name_changed_pet' : 'activity.name_changed_player', {
        name: String(d.name),
      });
    case 'daycare_invite':
      return t('activity.daycare_invite', {
        ownerName: String(d.ownerName),
        petName: String(d.petName),
      });
    case 'daycare_accepted':
    case 'daycare_declined':
      return t(`activity.${entry.kind}`, {
        caretakerName: String(d.caretakerName),
        petName: String(d.petName),
      });
    case 'daycare_ended':
      return t('activity.daycare_ended', { petName: String(d.petName) });
    case 'daycare_care':
      return t(`activity.daycare_care.${String(d.action)}` as MessageKey, {
        caretakerName: String(d.caretakerName),
        petName: String(d.petName),
      });
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
