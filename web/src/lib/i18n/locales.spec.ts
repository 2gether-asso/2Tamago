import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Structure of the dictionaries (see docs/I18N.md): one module per domain, the same files in
 * every language, keys named `namespace.element`, every key used and defined once.
 */

/** Each module owns the namespaces listed here. Adding a module or a namespace is deliberate. */
const NAMESPACES: Record<string, string[]> = {
  common: ['common', 'lang', 'duration'],
  shell: ['nav', 'theme', 'header'],
  catalog: ['stage', 'form', 'mood', 'alert', 'trick', 'temperament', 'item', 'stat'],
  feed: ['event', 'activity', 'notice'],
  home: ['home', 'action', 'walk'],
  minigame: ['minigame'],
  adopt: ['adopt'],
  social: ['village', 'visit', 'album', 'journal'],
  shop: ['shop'],
  auth: ['login'],
  admin: ['admin'],
  feedback: ['feedback'],
  errors: ['error'],
};

type Messages = Record<string, string>;
const modules = import.meta.glob<Record<string, Messages>>('./locales/*/*.ts', { eager: true });

/** `{ fr: { home: {...} }, en: { home: {...} } }`, without the `index.ts` aggregators. */
const locales: Record<string, Record<string, Messages>> = {};
for (const [path, exports] of Object.entries(modules)) {
  const [, , locale, file] = path.split('/') as [string, string, string, string];
  const name = file.replace(/\.ts$/, '');
  if (name === 'index') continue;
  locales[locale] ??= {};
  locales[locale][name] = exports[name]!;
}
const fr = locales.fr!;
const en = locales.en!;

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
const baseKey = (key: string) => key.replace(/_(one|other)$/, '');
const entries = Object.entries(fr).flatMap(([file, messages]) =>
  Object.entries(messages).map(([key, text]) => ({ file, key, text })),
);

describe('locale files', () => {
  it('have the same modules in every language, all registered', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort());
    for (const file of Object.keys(fr))
      expect(NAMESPACES[file], `${file} is registered`).toBeDefined();
  });

  it('have the same keys in every language, module by module', () => {
    for (const file of Object.keys(fr)) {
      expect(Object.keys(en[file]!).sort(), file).toEqual(Object.keys(fr[file]!).sort());
    }
  });

  it('only use their own namespaces', () => {
    for (const { file, key } of entries) {
      expect(NAMESPACES[file], `${key} in ${file}.ts`).toContain(key.split('.')[0]);
    }
  });

  it('define every key once across modules', () => {
    const seen = new Map<string, string>();
    for (const { file, key } of entries) {
      expect(seen.get(key), `${key} is in ${seen.get(key)}.ts and ${file}.ts`).toBeUndefined();
      seen.set(key, file);
    }
  });
});

describe('keys and messages', () => {
  it('are named namespace.element in lower snake_case', () => {
    for (const { key } of entries) {
      expect(key, key).toMatch(/^[a-z][a-z0-9]*(\.[a-z][a-z0-9_]*)+$/);
    }
  });

  it('use the same placeholders in every language', () => {
    for (const { file, key, text } of entries) {
      expect(placeholders(en[file]![key]!), key).toEqual(placeholders(text));
    }
  });

  it('give every plural both forms, with a count', () => {
    for (const messages of [fr, en].flatMap((locale) => Object.values(locale))) {
      for (const key of Object.keys(messages)) {
        const base = baseKey(key);
        if (base === key) continue;
        expect(messages[`${base}_one`], `${base}_one`).toBeDefined();
        expect(messages[`${base}_other`], `${base}_other`).toBeDefined();
        expect(placeholders(messages[key]!), key).toContain('count');
      }
    }
  });

  it('are not empty and have no stray whitespace', () => {
    for (const { file, key, text } of entries) {
      for (const value of [text, en[file]![key]!]) {
        expect(value.trim(), key).toBe(value);
        expect(value, key).not.toBe('');
      }
    }
  });
});

/** Source text of the app, without the dictionaries and the tests. */
function appSources(): string {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.(svelte|ts)$/.test(entry.name) && !entry.name.endsWith('.spec.ts'))
        files.push(path);
    }
  };
  walk(root);
  return files
    .filter((file) => !relative(root, file).startsWith(join('lib', 'i18n')))
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');
}

describe('usage', () => {
  it('has no unused key', () => {
    const source = appSources();
    // `t(`stage.${stage}`)` uses every key under `stage.`.
    const dynamic = [...source.matchAll(/`([a-z][a-z0-9_.]*)\.\$\{/g)].map((m) => `${m[1]}.`);
    const unused = [...new Set(entries.map((e) => baseKey(e.key)))].filter(
      (key) =>
        !source.includes(`'${key}'`) &&
        !source.includes(`"${key}"`) &&
        !dynamic.some((prefix) => key.startsWith(prefix)),
    );
    expect(unused).toEqual([]);
  });
});
