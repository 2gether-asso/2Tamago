import { common } from './common.ts';
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
import { feedback } from './feedback.ts';

/** French: the reference language. */
export const fr = {
  ...common,
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
  ...feedback,
} as const;
