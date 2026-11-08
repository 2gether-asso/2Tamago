import { describe, expect, it } from 'vitest';
import { activityText, eventText } from './texts.ts';

describe('texts', () => {
  it('describes pet events', () => {
    expect(eventText({ type: 'hatched', at: 0 }, 'Pompon')).toBe('Pompon est sorti de son œuf !');
    expect(eventText({ type: 'hatched', at: 0, data: { temperament: 'greedy' } }, 'Pompon')).toBe(
      'Pompon est sorti de son œuf ! Tempérament : gourmand.',
    );
    expect(eventText({ type: 'evolved', at: 0, data: { to: 'child' } }, 'Pompon')).toContain(
      'Enfant',
    );
    expect(eventText({ type: 'pooped', at: 0 }, 'Pompon')).toBeNull();
  });

  it('describes activity entries', () => {
    expect(
      activityText({
        id: '1',
        kind: 'visit_gift',
        data: { visitorName: 'Alice', petName: 'Pompon', item: 'cake' },
        createdAt: 0,
        read: false,
      }),
    ).toBe('Alice a offert Gâteau à Pompon.');
  });
});
