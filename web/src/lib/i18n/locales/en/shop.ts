import type { shop as fr } from '../fr/shop.ts';

/** The shop. */
export const shop: Record<keyof typeof fr, string> = {
  'shop.title': 'Shop',
  'shop.intro': 'Earn coins by playing, going for walks and visiting other companions.',
  'shop.snacks': 'Treats',
  'shop.in_bag': 'In your bag: {count}',
  'shop.accessories': 'Accessories',
  'shop.owned': 'Already yours ✔',
};
