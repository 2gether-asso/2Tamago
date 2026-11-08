import { render } from 'svelte/server';
import { EYES, PATTERNS, SPECIES, type Pattern, type Species } from '@2tamago/core';
import { describe, expect, it } from 'vitest';
import PetSprite from './PetSprite.svelte';

/** The SVG of a pet, as the server-side renderer writes it. */
function sprite(species: Species, pattern: Pattern, eyes: (typeof EYES)[number] = 'round') {
  return render(PetSprite, {
    props: {
      species,
      stage: 'adult',
      form: null,
      color: 120,
      mood: 'ok',
      traits: { temperament: 'greedy', pattern, eyes },
    },
  }).body;
}

const SHAPE = /<(ellipse|circle|rect|path)\b/g;
const shapes = (markup: string) => markup.match(SHAPE)?.length ?? 0;
const maskOf = (body: string) => body.match(/<mask\b[^>]*>([\s\S]*?)<\/mask>/)?.[1] ?? '';

describe('pet sprite traits, for every species', () => {
  for (const species of SPECIES) {
    describe(species, () => {
      it('masks every coat pattern with its own silhouette', () => {
        for (const pattern of PATTERNS.filter((p) => p !== 'plain')) {
          const body = sprite(species, pattern);
          // The pattern is applied through a mask that really contains the silhouette: an empty
          // mask would hide it entirely. Not a clipPath, which silently ignores groups (kumo).
          expect(shapes(maskOf(body)), `${species} ${pattern}`).toBeGreaterThan(0);
          expect(body).not.toContain('<clipPath');
          expect(body, `${species} ${pattern}`).toMatch(/<g mask="url\(#coat-/);
        }
      });

      it('has no pattern when plain', () => {
        const body = sprite(species, 'plain');
        expect(body).not.toMatch(/<g mask=/);
      });

      it('draws every eye style', () => {
        const markup = EYES.map((eyes) => sprite(species, 'plain', eyes));
        expect(new Set(markup).size).toBe(EYES.length);
      });
    });
  }

  it('gives each species its own silhouette', () => {
    const silhouettes = SPECIES.map((species) => maskOf(sprite(species, 'spots')));
    expect(new Set(silhouettes).size).toBe(SPECIES.length);
  });

  it('draws each pattern differently', () => {
    for (const species of SPECIES) {
      const bodies = PATTERNS.map((pattern) => sprite(species, pattern));
      expect(new Set(bodies).size, species).toBe(PATTERNS.length);
    }
  });
});
