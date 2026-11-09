import { describe, expect, it } from 'vitest';
import { PUSH_KINDS } from '@2tamago/core/contracts';
import { translate, type MessageKey } from './translate.ts';

/** The service worker writes `push.msg.<kind>`: every kind the API can send needs its message. */
describe('push notification messages', () => {
  it.each(['fr', 'en'] as const)('exist for every kind in %s', (locale) => {
    for (const kind of PUSH_KINDS) {
      const key = `push.msg.${kind}` as MessageKey;
      const text = translate(locale, key, { petName: 'Pompon', playerName: 'Alice' });
      expect(text, key).not.toBe(key);
      expect(text).not.toMatch(/\{\w+\}/);
    }
  });

  it('names the pet', () => {
    expect(translate('fr', 'push.msg.hungry', { petName: 'Pompon' })).toBe('Pompon a faim !');
    expect(translate('en', 'push.msg.hungry', { petName: 'Pompon' })).toBe('Pompon is hungry!');
  });

  it('names who entrusts the companion', () => {
    const params = { petName: 'Pompon', playerName: 'Alice' };
    expect(translate('fr', 'push.msg.daycare_invite', params)).toBe(
      'Alice aimerait te confier Pompon.',
    );
    expect(translate('en', 'push.msg.daycare_invite', params)).toBe(
      'Alice would like to entrust you with Pompon.',
    );
  });
});
