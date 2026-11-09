import { en } from './locales/en/index.ts';
import { fr } from './locales/fr/index.ts';

/**
 * The messages and the function that reads them: no Svelte state and no browser API, so that
 * the service worker (which writes the push notifications) can use them too.
 */
export const LOCALES = ['fr', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

const DICTIONARIES: Record<Locale, Record<string, string>> = { fr, en };

type Key = keyof typeof fr;
type WithoutPluralSuffix<K> = K extends `${infer Base}_${'one' | 'other'}` ? Base : K;
/** A translation key. Plural keys are written without their `_one` / `_other` suffix. */
export type MessageKey = WithoutPluralSuffix<Key>;
export type Params = Record<string, string | number>;

/** Replaces `{name}` placeholders. */
export function format(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/** Translates `key` in `locale`. Falls back to French, then to the key itself. */
export function translate(locale: Locale, key: MessageKey, params?: Params): string {
  const dictionary = DICTIONARIES[locale];
  let template: string | undefined;
  if (params && typeof params.count === 'number') {
    const category = new Intl.PluralRules(locale).select(params.count);
    template = dictionary[`${key}_${category}`] ?? dictionary[`${key}_other`];
  }
  template ??= dictionary[key] ?? DICTIONARIES.fr[key] ?? key;
  return format(template, params);
}

/** Whether `key` has a message (for keys built from data, such as an error code). */
export function hasMessage(key: string): boolean {
  return key in DICTIONARIES.fr;
}
