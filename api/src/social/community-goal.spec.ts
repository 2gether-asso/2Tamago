import { GOAL, targetFor } from './community-goal.js';

describe('targetFor', () => {
  it('has a floor for a small community', () => {
    expect(targetFor(0)).toBe(GOAL.minWalks);
    expect(targetFor(1)).toBe(GOAL.minWalks);
  });

  it('grows with the number of living companions', () => {
    expect(targetFor(10)).toBe(10 * GOAL.walksPerPet);
    expect(targetFor(40)).toBe(40 * GOAL.walksPerPet);
  });
});
