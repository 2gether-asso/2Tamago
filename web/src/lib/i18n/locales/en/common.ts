import type { common as fr } from '../fr/common.ts';

/** Texts shared by several screens: loading, retry, durations, language names. */
export const common: Record<keyof typeof fr, string> = {
  'lang.fr': 'Français',
  'lang.en': 'English',
  'lang.switch': 'Language',

  'duration.min_sec': '{minutes} min {seconds} s',

  'common.loading': 'Loading…',
  'common.retry': 'Try again',
};
