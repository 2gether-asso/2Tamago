/**
 * French texts: the reference dictionary. `en.ts` must have exactly the same keys (checked by the
 * compiler and by `i18n.spec.ts`). Plurals use `_one` and `_other` suffixes and a `count` param.
 */
export const fr = {
  'lang.fr': 'Français',
  'lang.en': 'English',
  'lang.switch': 'Langue',

  'item.cookie': 'Biscuit',
  'item.strawberry': 'Fraise',
  'item.warm_milk': 'Lait chaud',
  'item.cake': 'Gâteau',
  'item.ribbon': 'Nœud',
  'item.hat': 'Chapeau',
  'item.glasses': 'Lunettes',
  'item.crown': 'Couronne',

  'notice.coins_earned_one': '+{count} pièce',
  'notice.coins_earned_other': '+{count} pièces',
  'notice.pet_happy': '{petName} est tout content !',
  'notice.gift_given': '{item} offert à {petName} !',
  'notice.walk_found_coins_one': '+{count} pièce trouvée',
  'notice.walk_found_coins_other': '+{count} pièces trouvées',
  'notice.walk_found_item': 'Trouvé : {item}',
  'notice.walk_met': 'Rencontre avec {petName} ({ownerName})',
} as const;
