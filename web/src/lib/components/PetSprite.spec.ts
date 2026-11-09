import { render } from 'svelte/server';
import { EYES, PATTERNS, SPECIES, STAGES, type Pattern, type Species } from '@2tamago/core';
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

/** Species with parts behind the body (ears, tail, spikes), which get their own coat. */
const HAS_BACK = new Set<Species>(['pyon', 'koro', 'nyao', 'toge', 'kame']);

const SHAPE = /<(?:ellipse|circle|rect|path)\b[^>]*>/g;
const shapes = (markup: string) => markup.match(SHAPE) ?? [];
/** The masks of the coat patterns: `{ back, front }`. */
function masksOf(body: string) {
  const find = (part: string) =>
    body.match(new RegExp(`<mask id="coat-${part}-[^"]*"[^>]*>([\\s\\S]*?)</mask>`))?.[1] ?? '';
  return { back: find('back'), front: find('front') };
}

describe('pet sprite traits, for every species', () => {
  for (const species of SPECIES) {
    describe(species, () => {
      it('masks every coat pattern with its own silhouette', () => {
        for (const pattern of PATTERNS.filter((p) => p !== 'plain')) {
          const body = sprite(species, pattern);
          const { back, front } = masksOf(body);
          // The pattern is applied through masks that really contain the silhouette: an empty
          // mask would hide it entirely. Not a clipPath, which silently ignores groups (kumo).
          expect(shapes(front).length, `${species} ${pattern}`).toBeGreaterThan(0);
          expect(shapes(back).length > 0, `${species} ${pattern} back`).toBe(HAS_BACK.has(species));
          expect(body).not.toContain('<clipPath');
          expect(body).toMatch(/<g mask="url\(#coat-front-/);
        }
      });

      it('keeps the coat of the back parts away from the body outline', () => {
        // A stripe over the body must stop at the body outline, not run on to the ears, the tail
        // or the spikes behind it: the two parts are masked separately.
        const { back, front } = masksOf(sprite(species, 'stripes'));
        for (const shape of shapes(back))
          expect(front, `${species}: ${shape}`).not.toContain(shape);
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
    const silhouettes = SPECIES.map((species) => {
      const { back, front } = masksOf(sprite(species, 'spots'));
      return back + front;
    });
    expect(new Set(silhouettes).size).toBe(SPECIES.length);
  });

  it('draws each pattern differently', () => {
    for (const species of SPECIES) {
      const bodies = PATTERNS.map((pattern) => sprite(species, pattern));
      expect(new Set(bodies).size, species).toBe(PATTERNS.length);
    }
  });

  it('draws every life stage differently', () => {
    const bodies = STAGES.map(
      (stage) =>
        render(PetSprite, {
          props: { species: 'pyon', stage, form: null, color: 120, mood: 'ok' },
        }).body,
    );
    expect(new Set(bodies).size).toBe(STAGES.length);
  });
});
