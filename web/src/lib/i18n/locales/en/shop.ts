import type { shop as fr } from '../fr/shop.ts';

/** The shop. */
export const shop: Record<keyof typeof fr, string> = {
  'shop.code_title': 'Gift code',
  'shop.code_hint': 'Got a code? Enter it here.',
  'shop.code_label': 'Code',
  'shop.code_redeem': 'Redeem',
  'shop.code_coins_one': '{count} coin',
  'shop.code_coins_other': '{count} coins',
  'shop.code_done': 'Code accepted: {reward}.',
  'shop.title': 'Shop',
  'shop.intro': 'Earn coins by playing, going for walks and visiting other companions.',
  'shop.snacks': 'Treats',
  'shop.in_bag': 'In your bag: {count}',
  'shop.accessories': 'Accessories',
  'shop.owned': 'Already yours ✔',
};
