import { LOCALES, translate, type Locale, type MessageKey, type Params } from './translate.ts';

export { format, hasMessage, translate } from './translate.ts';
export type { Locale, MessageKey, Params } from './translate.ts';

const STORAGE_KEY = 'locale';

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

const INTL_TAGS: Record<Locale, string> = { fr: 'fr-FR', en: 'en-GB' };

/** BCP 47 tag of the current language, for `Intl` formatters. Reactive like `t()`. */
export function intlTag(): string {
  return INTL_TAGS[i18n.locale];
}

/** Translates in the current language. Reactive: reading `i18n.locale` tracks changes. */
export function t(key: MessageKey, params?: Params): string {
  return translate(i18n.locale, key, params);
}
