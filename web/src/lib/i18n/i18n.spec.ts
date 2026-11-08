import { describe, expect, it } from 'vitest';
import { en } from './en.ts';
import { fr } from './fr.ts';
import { format, translate, type MessageKey } from './index.svelte.ts';

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();

describe('dictionaries', () => {
  it('have the same keys in French and English', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort());
  });

  it('use the same placeholders in both languages', () => {
    for (const key of Object.keys(fr) as (keyof typeof fr)[]) {
      expect(placeholders(en[key]), key).toEqual(placeholders(fr[key]));
    }
  });

  it('give every plural key both forms', () => {
    for (const dictionary of [fr, en] as Record<string, string>[]) {
      for (const key of Object.keys(dictionary)) {
        const base = key.replace(/_(one|other)$/, '');
        if (base === key) continue;
        expect(dictionary[`${base}_one`], base).toBeDefined();
        expect(dictionary[`${base}_other`], base).toBeDefined();
      }
    }
  });
});

describe('translate', () => {
  it('translates and interpolates', () => {
    expect(translate('fr', 'lang.switch')).toBe('Langue');
    expect(translate('en', 'lang.switch')).toBe('Language');
    expect(format('Hello {name}, {name}!', { name: 'Ada' })).toBe('Hello Ada, Ada!');
    expect(format('Hi {missing}', { other: 1 })).toBe('Hi {missing}');
  });

  it('falls back to the key for an unknown message', () => {
    expect(translate('en', 'nope.nothing' as MessageKey)).toBe('nope.nothing');
  });
});
