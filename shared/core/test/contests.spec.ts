import { describe, expect, it } from 'vitest';
import {
  contestProblem,
  CONTEST_PRIZES,
  createPet,
  gameHours,
  prizeFor,
  rankEntries,
  simulate,
  trickScore,
  withRules,
  type PetState,
  type Stage,
} from '../src/index.js';

const rules = withRules();
const T0 = Date.UTC(2026, 0, 1);

function pet(stage: Stage = 'child', overrides: Partial<PetState> = {}): PetState {
  const egg = createPet({ name: 'Pompon', species: 'mochi', color: 120, now: T0 }, rules);
  const hatched = simulate(egg, T0 + gameHours(rules, 0.2), rules).state;
  return { ...hatched, stage, ...overrides };
}

describe('trickScore', () => {
  it('adds up what the pet has learned', () => {
    expect(trickScore(pet())).toBe(0);
    const learned = pet('child', { tricks: { sit: 100, spin: 50, jump: 25.4, highfive: 0 } });
    expect(trickScore(learned)).toBe(175);
    expect(
      trickScore(pet('child', { tricks: { sit: 100, spin: 100, jump: 100, highfive: 100 } })),
    ).toBe(400);
  });
});

describe('contestProblem', () => {
  it('lets a hatched, awake-or-not companion enter', () => {
    expect(contestProblem('beauty', pet('baby'))).toBeNull();
    expect(contestProblem('tricks', pet('child'))).toBeNull();
    expect(contestProblem('tricks', pet('elder'))).toBeNull();
  });

  it('keeps out what cannot compete', () => {
    expect(contestProblem('beauty', pet('egg'))).toBe('still_an_egg');
    expect(contestProblem('tricks', pet('baby'))).toBe('too_young');
    expect(contestProblem('beauty', pet('child', { status: 'gone' }))).toBe('pet_gone');
    expect(contestProblem('beauty', pet('child', { status: 'retired' }))).toBe('pet_gone');
    expect(contestProblem('tricks', pet('child', { vacationSince: T0 }))).toBe('on_vacation');
  });
});

describe('rankEntries', () => {
  it('ranks by score, then by who entered first', () => {
    const ranked = rankEntries([
      { id: 'a', score: 10, enteredAt: 3 },
      { id: 'b', score: 30, enteredAt: 9 },
      { id: 'c', score: 10, enteredAt: 1 },
      { id: 'd', score: 20, enteredAt: 5 },
    ]);
    expect(ranked.map((e) => [e.id, e.rank])).toEqual([
      ['b', 1],
      ['d', 2],
      ['c', 3],
      ['a', 4],
    ]);
  });

  it('does not touch what it is given, and copes with nothing', () => {
    const input = [
      { score: 1, enteredAt: 1 },
      { score: 2, enteredAt: 2 },
    ];
    rankEntries(input);
    expect(input[0]!.score).toBe(1);
    expect(rankEntries([])).toEqual([]);
  });
});

describe('prizeFor', () => {
  it('pays the podium, and only the podium', () => {
    expect([1, 2, 3].map(prizeFor)).toEqual([...CONTEST_PRIZES]);
    expect(prizeFor(4)).toBe(0);
    expect(prizeFor(0)).toBe(0);
    expect(CONTEST_PRIZES[0]).toBeGreaterThan(CONTEST_PRIZES[1]);
    expect(CONTEST_PRIZES[1]).toBeGreaterThan(CONTEST_PRIZES[2]);
  });
});
