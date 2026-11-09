import { affinityScore, compareVillage } from './affinity.js';

describe('village ranking', () => {
  it('weighs encounters more than a caress or a gift', () => {
    expect(affinityScore({ interactions: 0, encounters: 0 })).toBe(0);
    expect(affinityScore({ interactions: 2, encounters: 1 })).toBe(5);
  });

  it('puts favorites first, then affinity, then recent activity', () => {
    const entries = [
      { name: 'recent', favorite: false, affinity: 0, updatedAt: 30 },
      { name: 'close', favorite: false, affinity: 4, updatedAt: 10 },
      { name: 'fav-old', favorite: true, affinity: 0, updatedAt: 1 },
      { name: 'fav-close', favorite: true, affinity: 5, updatedAt: 1 },
      { name: 'old', favorite: false, affinity: 0, updatedAt: 20 },
    ];
    expect(entries.sort(compareVillage).map((e) => e.name)).toEqual([
      'fav-close',
      'fav-old',
      'close',
      'recent',
      'old',
    ]);
  });
});
