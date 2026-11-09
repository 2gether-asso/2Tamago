/** Error codes returned when an action is not possible right now. */
export const GAME_ERROR_CODES = [
  'pet_gone',
  'still_an_egg',
  'asleep',
  'awake',
  'away',
  'not_away',
  'outing_not_finished',
  'too_young',
  'not_hungry',
  'not_sleepy',
  'not_sick',
  'too_tired',
  'too_hungry',
  'unknown_item',
  'not_elder',
  'not_night',
  'on_vacation',
  'not_on_vacation',
  'vacation_cooldown',
  'zone_locked',
  'tired_of_playing',
  'praise_cooldown',
] as const;

export type GameErrorCode = (typeof GAME_ERROR_CODES)[number];

export const GAME_ERROR_MESSAGES: Record<GameErrorCode, string> = {
  pet_gone: 'Ton compagnon est parti.',
  still_an_egg: 'C’est encore un œuf, patience !',
  asleep: 'Chut… il dort.',
  awake: 'Il est déjà réveillé.',
  away: 'Il est en promenade.',
  not_away: 'Il n’est pas en promenade.',
  outing_not_finished: 'La promenade n’est pas finie.',
  too_young: 'Il est encore trop jeune pour ça.',
  not_hungry: 'Il n’a plus faim.',
  not_sleepy: 'Il n’a pas sommeil.',
  not_sick: 'Il n’est pas malade.',
  too_tired: 'Il est trop fatigué.',
  too_hungry: 'Il a trop faim pour ça.',
  unknown_item: 'Objet inconnu.',
  not_elder: 'Seul un compagnon âgé peut prendre sa retraite.',
  not_night: 'Ce n’est pas encore l’heure du coucher.',
  on_vacation: 'Il est en vacances.',
  not_on_vacation: 'Il n’est pas en vacances.',
  vacation_cooldown: 'Il est rentré de vacances il y a trop peu de temps.',
  zone_locked: 'Il est encore trop jeune pour aller là-bas.',
  tired_of_playing: 'Il en a assez de jouer pour le moment.',
  praise_cooldown: 'Tu l’as déjà félicité il y a peu.',
};

export class GameError extends Error {
  constructor(readonly code: GameErrorCode) {
    super(GAME_ERROR_MESSAGES[code]);
    this.name = 'GameError';
  }
}
