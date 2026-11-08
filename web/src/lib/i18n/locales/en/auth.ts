import type { auth as fr } from '../fr/auth.ts';

/** The sign-in screen. */
export const auth: Record<keyof typeof fr, string> = {
  'login.intro': 'Adopt a companion, look after it, and visit the ones of other 2GETHER members.',
  'login.discord': 'Sign in with Discord',
  'login.dev_hint': 'Development mode: sign in with a nickname.',
  'login.nickname': 'Nickname',
  'login.enter': 'Enter',
  'login.none': 'No sign-in method is configured.',
  'login.unreachable': 'The server cannot be reached.',
  'login.error.not_member': 'You need to be a member of the 2GETHER Discord to play.',
  'login.error.state': 'The sign-in expired, please try again.',
  'login.error.denied': 'Sign-in cancelled.',
  'login.error.discord': 'Discord is not answering right now, please try again in a moment.',
  'login.join': 'Join the 2GETHER Discord',
};
