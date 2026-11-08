import type { adopt as fr } from '../fr/adopt.ts';

/** The adoption form. */
export const adopt: Record<keyof typeof fr, string> = {
  'adopt.title': 'Adopt a companion',
  'adopt.species': 'Species',
  'adopt.randomize_all': 'Surprise me!',
  'adopt.randomize_hint':
    'Shuffles everything at random. Nothing is submitted: you can still change anything.',
  'adopt.randomize_species': 'Random species',
  'adopt.randomize_color': 'Random color',
  'adopt.randomize_name': 'Random name',
  'adopt.color': 'Color',
  'adopt.name': 'Name',
  'adopt.name_hint': 'Letters, digits, spaces and hyphens only',
  'adopt.submit': 'Get my egg 🥚',
};
