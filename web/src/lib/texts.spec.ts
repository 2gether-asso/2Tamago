import { afterEach, describe, expect, it } from 'vitest';
import { i18n } from './i18n/index.svelte.ts';
import { activityText, eventText, noticeText } from './texts.ts';

afterEach(() => (i18n.locale = 'fr'));

describe('texts in French', () => {
  it('describes pet events', () => {
    i18n.locale = 'fr';
    expect(eventText({ type: 'hatched', at: 0 }, 'Pompon')).toBe('Pompon est sorti de son œuf !');
    expect(eventText({ type: 'hatched', at: 0, data: { temperament: 'greedy' } }, 'Pompon')).toBe(
      'Pompon est sorti de son œuf ! Tempérament : gourmand.',
    );
    expect(eventText({ type: 'evolved', at: 0, data: { to: 'child' } }, 'Pompon')).toContain(
      'Enfant',
    );
    expect(eventText({ type: 'pooped', at: 0 }, 'Pompon')).toBeNull();
  });

  it('describes activity entries and notices, with plurals', () => {
    i18n.locale = 'fr';
    expect(
      activityText({
        id: '1',
        kind: 'visit_gift',
        data: { visitorName: 'Alice', petName: 'Pompon', item: 'cake' },
        createdAt: 0,
        read: false,
      }),
    ).toBe('Alice a offert Gâteau à Pompon.');
    expect(noticeText({ code: 'coins_earned', count: 1 })).toBe('+1 pièce');
    expect(noticeText({ code: 'coins_earned', count: 3 })).toBe('+3 pièces');
  });
});

describe('texts in English', () => {
  it('writes the same things in English', () => {
    i18n.locale = 'en';
    expect(eventText({ type: 'hatched', at: 0, data: { temperament: 'greedy' } }, 'Pompon')).toBe(
      'Pompon hatched! Temperament: greedy.',
    );
    expect(eventText({ type: 'evolved', at: 0, data: { to: 'child' } }, 'Pompon')).toBe(
      'Pompon grew up: Child!',
    );
    expect(noticeText({ code: 'walk_found_coins', count: 1 })).toBe('+1 coin found');
    expect(noticeText({ code: 'walk_found_coins', count: 12 })).toBe('+12 coins found');
    expect(noticeText({ code: 'gift_given', item: 'cake', petName: 'Pompon' })).toBe(
      'Cake given to Pompon!',
    );
  });
});
