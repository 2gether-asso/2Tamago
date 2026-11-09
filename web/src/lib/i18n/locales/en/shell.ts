import type { shell as fr } from '../fr/shell.ts';

/** The app chrome: navigation bar, header and theme switcher. */
export const shell: Record<keyof typeof fr, string> = {
  'nav.home': 'Home',
  'nav.contests': 'Contests',
  'nav.work': 'Work',
  'nav.village': 'Village',
  'nav.shop': 'Shop',
  'nav.journal': 'Journal',
  'nav.sheet': 'Sheet',
  'nav.album': 'Album',
  'nav.admin': 'Admin',

  'theme.system': 'Automatic theme',
  'theme.light': 'Day theme',
  'theme.dark': 'Night theme',
  'theme.cycle': '{label} (click to change)',

  'header.coins': 'Coins',
  'header.logout': 'Log out',
};
