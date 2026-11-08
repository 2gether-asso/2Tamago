import type { fr } from './fr.ts';

export const en: Record<keyof typeof fr, string> = {
  'lang.fr': 'Français',
  'lang.en': 'English',
  'lang.switch': 'Language',

  'item.cookie': 'Cookie',
  'item.strawberry': 'Strawberry',
  'item.warm_milk': 'Warm milk',
  'item.cake': 'Cake',
  'item.ribbon': 'Bow',
  'item.hat': 'Hat',
  'item.glasses': 'Glasses',
  'item.crown': 'Crown',

  'notice.coins_earned_one': '+{count} coin',
  'notice.coins_earned_other': '+{count} coins',
  'notice.pet_happy': '{petName} is thrilled!',
  'notice.gift_given': '{item} given to {petName}!',
  'notice.walk_found_coins_one': '+{count} coin found',
  'notice.walk_found_coins_other': '+{count} coins found',
  'notice.walk_found_item': 'Found: {item}',
  'notice.walk_met': 'Met {petName} ({ownerName})',
};
