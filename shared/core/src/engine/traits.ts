import { EYES, PATTERNS, TEMPERAMENTS, type PetState, type PetTraits } from './types.js';

/** Small seeded PRNG (mulberry32): same seed, same sequence, on every machine. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 32-bit FNV-1a hash of a string, to derive a seed from stable data. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Rolls a pet's traits from a seed. Pure: the caller supplies the randomness. */
export function rollTraits(seed: number): PetTraits {
  const next = prng(seed);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)]!;
  return { temperament: pick(TEMPERAMENTS), pattern: pick(PATTERNS), eyes: pick(EYES) };
}

/** Traits to give a pet that has none (created before traits existed). */
export function legacyTraits(state: Pick<PetState, 'name' | 'bornAt'>): PetTraits {
  return rollTraits(hashSeed(`${state.name}:${state.bornAt}`));
}

/** The pet's traits, whether stored or backfilled. */
export function traitsOf(state: Pick<PetState, 'name' | 'bornAt' | 'traits'>): PetTraits {
  return state.traits ?? legacyTraits(state);
}
