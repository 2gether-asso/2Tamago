import type { shop as fr } from '../fr/shop.ts';

/** The shop. */
export const shop: Record<keyof typeof fr, string> = {
  'promo.title': 'Events',
  'promo.walk_coins': '🚶 Walks: +{percent}% coins found',
  'promo.daily_bonus': '🎁 Daily bonus: +{percent}%',
  'promo.caress_reward': '💞 Visit caresses: +{percent}% coins',
  'promo.shop_discount': '🛍️ Shop: −{percent}%',
  'promo.until': 'until {date}',
  'promo.from': 'from {date}',
  'shop.code_title': 'Gift code',
  'shop.code_hint': 'Got a code? Enter it here.',
  'shop.code_label': 'Code',
  'shop.code_redeem': 'Redeem',
  'shop.code_coins_one': '{count} coin',
  'shop.code_coins_other': '{count} coins',
  'shop.code_done': 'Code accepted: {reward}.',
  'shop.title': 'Shop',
  'shop.wish_title': 'My wishlist',
  'shop.wish_hint':
    'Mark the items you would like with 🤍 (up to {max}). Others see them on your profile, and you can ask for them from theirs.',
  'shop.wish_empty': 'Nothing yet.',
  'shop.wish_add': 'Add to my wishlist',
  'shop.wish_remove': 'Remove from my wishlist',
  'shop.intro': 'Earn coins by playing, going for walks and visiting other companions.',
  'shop.snacks': 'Treats',
  'shop.in_bag': 'In your bag: {count}',
  'shop.accessories': 'Accessories',
  'shop.owned': 'Already yours ✔',
};
