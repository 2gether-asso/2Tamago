/** Sentences built from engine events, journal entries and API notices. */
export const feed = {
  'notice.coins_earned_one': '+{count} pièce',
  'notice.coins_earned_other': '+{count} pièces',
  'notice.pet_happy': '{petName} est tout content !',
  'notice.gift_given': '{item} offert à {petName} !',
  'notice.walk_found_coins_one': '+{count} pièce trouvée',
  'notice.walk_found_coins_other': '+{count} pièces trouvées',
  'notice.walk_found_item': 'Trouvé : {item}',
  'notice.walk_met': 'Rencontre avec {petName} ({ownerName})',

  'event.hatched': '{name} est sorti de son œuf !',
  'event.hatched_temperament': '{name} est sorti de son œuf ! Tempérament : {temperament}.',
  'event.evolved': '{name} a grandi : {stage} !',
  'event.fell_ill': '{name} est tombé malade.',
  'event.cured': '{name} est guéri !',
  'event.care_mistake': '{name} s’est senti délaissé…',
  'event.fell_asleep_exhausted': '{name} s’est endormi d’épuisement.',
  'event.fell_asleep': 'Bonne nuit {name}.',
  'event.woke_up': '{name} est réveillé.',
  'event.attention_call': '{name} fait un caprice !',
  'event.trick_level_up': '{name} progresse en « {trick} » !',
  'event.departed': '{name} est parti…',
  'event.retired': '{name} part couler des jours paisibles.',

  'activity.daily_bonus_one': 'Bonus du jour : +{count} pièce.',
  'activity.daily_bonus_other': 'Bonus du jour : +{count} pièces.',
  'activity.community_reward_one':
    'Objectif du village atteint : +{count} pièce pour ta participation.',
  'activity.community_reward_other':
    'Objectif du village atteint : +{count} pièces pour ta participation.',
  'activity.visit_caress': '{visitorName} est passé caresser {petName}.',
  'activity.visit_gift': '{visitorName} a offert {item} à {petName}.',
  'activity.encounter': 'Rencontre en promenade avec {otherPetName} ({otherOwnerName}).',
} as const;
