import type { fr } from '../fr/index.ts';
import { common } from './common.ts';
import { profile } from './profile.ts';
import { shell } from './shell.ts';
import { catalog } from './catalog.ts';
import { feed } from './feed.ts';
import { home } from './home.ts';
import { minigame } from './minigame.ts';
import { adopt } from './adopt.ts';
import { social } from './social.ts';
import { shop } from './shop.ts';
import { auth } from './auth.ts';
import { admin } from './admin.ts';
import { errors } from './errors.ts';
import { feedback } from './feedback.ts';
import { push } from './push.ts';

/** English: must have exactly the keys of `fr`. */
export const en: Record<keyof typeof fr, string> = {
  ...common,
  ...profile,
  ...shell,
  ...catalog,
  ...feed,
  ...home,
  ...minigame,
  ...adopt,
  ...social,
  ...shop,
  ...auth,
  ...admin,
  ...errors,
  ...feedback,
  ...push,
};
