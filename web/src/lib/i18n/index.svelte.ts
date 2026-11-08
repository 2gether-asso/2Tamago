import { en } from './locales/en/index.ts';
import { fr } from './locales/fr/index.ts';

export const LOCALES = ['fr', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

const DICTIONARIES: Record<Locale, Record<string, string>> = { fr, en };
const STORAGE_KEY = 'locale';

type Key = keyof typeof fr;
type WithoutPluralSuffix<K> = K extends `${infer Base}_${'one' | 'other'}` ? Base : K;
/** A translation key. Plural keys are written without their `_one` / `_other` suffix. */
export type MessageKey = WithoutPluralSuffix<Key>;
export type Params = Record<string, string | number>;

function isLocale(value: unknown): value is Locale {
  return LOCALES.includes(value as Locale);
}

/** Saved choice, else the browser language, else English. */
export function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    // Storage unavailable: fall through to the browser language.
  }
  const preferred = typeof navigator === 'undefined' ? [] : (navigator.languages ?? []);
  for (const language of preferred) {
    const base = language.slice(0, 2).toLowerCase();
    if (isLocale(base)) return base;
  }
  return 'en';
}

class I18n {
  locale = $state<Locale>(detectLocale());

  set(locale: Locale): void {
    this.locale = locale;
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // The choice only lasts for this page.
    }
  }
}

export const i18n = new I18n();

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

const INTL_TAGS: Record<Locale, string> = { fr: 'fr-FR', en: 'en-GB' };

/** BCP 47 tag of the current language, for `Intl` formatters. Reactive like `t()`. */
export function intlTag(): string {
  return INTL_TAGS[i18n.locale];
}

/** Whether `key` has a message (for keys built from data, such as an error code). */
export function hasMessage(key: string): boolean {
  return key in DICTIONARIES.fr;
}

/** Translates in the current language. Reactive: reading `i18n.locale` tracks changes. */
export function t(key: MessageKey, params?: Params): string {
  return translate(i18n.locale, key, params);
}
