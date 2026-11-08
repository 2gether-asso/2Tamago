import type { profile as fr } from '../fr/profile.ts';

/** The player profile page: player card and companion card. */
export const profile: Record<keyof typeof fr, string> = {
  'profile.you': 'This is you',
  'profile.member_since': 'Member since {date}',
  'profile.player_card': 'Player card',
  'profile.pet_card': 'Companion card',
  'profile.mine': 'My profile',
  'profile.view': 'View {name}’s profile',
  'profile.stat.companions': 'Companions raised',
  'profile.stat.best_age': 'Longest life',
  'profile.stat.retired': 'Retired',
  'profile.stat.departed': 'Left',
  'profile.stat.caresses_given': 'Pets given',
  'profile.stat.caresses_received': 'Pets received',
  'profile.stat.gifts_given': 'Gifts given',
  'profile.stat.gifts_received': 'Gifts received',
  'profile.stat.walks': 'Walks',
  'profile.stat.encounters': 'Encounters',
  'profile.no_pet': 'No companion at the moment.',
  'profile.egg': 'Its egg has not hatched yet…',
  'profile.tricks': 'Tricks learned',
  'profile.equipped': 'Wearing: {item}',
  'profile.visit': 'Pay a visit',
  'profile.album': 'My album',
};
