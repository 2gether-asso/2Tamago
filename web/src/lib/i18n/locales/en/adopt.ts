import type { adopt as fr } from '../fr/adopt.ts';

/** The adoption form. */
export const adopt: Record<keyof typeof fr, string> = {
  'adopt.title': 'Adopt a companion',
  'adopt.color': 'Color',
  'adopt.name': 'Name',
  'adopt.name_hint': 'Letters, digits, spaces and hyphens only',
  'adopt.submit': 'Get my egg 🥚',
};
