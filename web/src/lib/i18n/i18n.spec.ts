import { describe, expect, it } from 'vitest';
import { format, translate, type MessageKey } from './index.svelte.ts';

describe('translate', () => {
  it('translates and interpolates', () => {
    expect(translate('fr', 'lang.switch')).toBe('Langue');
    expect(translate('en', 'lang.switch')).toBe('Language');
    expect(format('Hello {name}, {name}!', { name: 'Ada' })).toBe('Hello Ada, Ada!');
    expect(format('Hi {missing}', { other: 1 })).toBe('Hi {missing}');
  });

  it('picks the plural form of the language', () => {
    expect(translate('fr', 'notice.coins_earned', { count: 0 })).toBe('+0 pièce'); // French: 0 is singular
    expect(translate('fr', 'notice.coins_earned', { count: 2 })).toBe('+2 pièces');
    expect(translate('en', 'notice.coins_earned', { count: 0 })).toBe('+0 coins');
    expect(translate('en', 'notice.coins_earned', { count: 1 })).toBe('+1 coin');
  });

  it('falls back to the key for an unknown message', () => {
    expect(translate('en', 'nope.nothing' as MessageKey)).toBe('nope.nothing');
  });
});
