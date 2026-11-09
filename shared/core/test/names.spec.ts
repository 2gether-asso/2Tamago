import { describe, expect, it } from 'vitest';
import { blockedTerm, normalizeName } from '../src/index.js';

describe('normalizeName', () => {
  it('ignores case, accents, spaces and punctuation', () => {
    expect(normalizeName('Héllo  W.o-r_ld')).toBe('helloworld');
    expect(normalizeName('ÉLÈVE')).toBe('eleve');
  });

  it('reads digits and symbols that look like letters', () => {
    expect(normalizeName('h4t3')).toBe('hate');
    expect(normalizeName('$pam')).toBe('spam');
    expect(normalizeName('b@d')).toBe('bad');
    expect(normalizeName('T0m!')).toBe('tomi');
  });

  it('keeps nothing else', () => {
    expect(normalizeName('😀 12 ?')).toBe('i');
    expect(normalizeName('')).toBe('');
  });
});

describe('blockedTerm', () => {
  const blocked = ['badword', 'Méchant'];

  it('finds a blocked term, whatever the disguise', () => {
    expect(blockedTerm('badword', blocked)).toBe('badword');
    expect(blockedTerm('B4D W0RD', blocked)).toBe('badword');
    expect(blockedTerm('xx_Bad-Word_xx', blocked)).toBe('badword');
    expect(blockedTerm('mechant', blocked)).toBe('Méchant');
  });

  it('lets other names through', () => {
    expect(blockedTerm('Pompon', blocked)).toBeNull();
    expect(blockedTerm('', blocked)).toBeNull();
    expect(blockedTerm('Pompon', [])).toBeNull();
  });

  it('ignores terms too short to mean anything, or empty once read', () => {
    expect(blockedTerm('Pompon', ['x', '', '123', 'p'])).toBeNull();
  });

  it('matches inside a longer name (so short terms must be chosen with care)', () => {
    expect(blockedTerm('classe', ['ass'])).toBe('ass');
  });
});
