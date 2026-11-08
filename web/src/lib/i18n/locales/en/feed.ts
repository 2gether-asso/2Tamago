import type { feed as fr } from '../fr/feed.ts';

/** Sentences built from engine events, journal entries and API notices. */
export const feed: Record<keyof typeof fr, string> = {
  'notice.coins_earned_one': '+{count} coin',
  'notice.coins_earned_other': '+{count} coins',
  'notice.pet_happy': '{petName} is thrilled!',
  'notice.gift_given': '{item} given to {petName}!',
  'notice.walk_found_coins_one': '+{count} coin found',
  'notice.walk_found_coins_other': '+{count} coins found',
  'notice.walk_found_item': 'Found: {item}',
  'notice.walk_met': 'Met {petName} ({ownerName})',

  'event.hatched': '{name} hatched!',
  'event.hatched_temperament': '{name} hatched! Temperament: {temperament}.',
  'event.evolved': '{name} grew up: {stage}!',
  'event.fell_ill': '{name} fell ill.',
  'event.cured': '{name} is better!',
  'event.care_mistake': '{name} felt neglected…',
  'event.fell_asleep_exhausted': '{name} fell asleep from exhaustion.',
  'event.fell_asleep': 'Good night, {name}.',
  'event.woke_up': '{name} woke up.',
  'event.attention_call': '{name} is throwing a tantrum!',
  'event.trick_level_up': '{name} is getting better at “{trick}”!',
  'event.departed': '{name} has left…',
  'event.retired': '{name} is off to enjoy a quiet life.',

  'activity.daily_bonus_one': 'Daily bonus: +{count} coin.',
  'activity.daily_bonus_other': 'Daily bonus: +{count} coins.',
  'activity.community_reward_one': 'Village goal reached: +{count} coin for taking part.',
  'activity.community_reward_other': 'Village goal reached: +{count} coins for taking part.',
  'activity.visit_caress': '{visitorName} stopped by to pet {petName}.',
  'activity.visit_gift': '{visitorName} gave {item} to {petName}.',
  'activity.encounter': 'Met {otherPetName} ({otherOwnerName}) on a walk.',
};
