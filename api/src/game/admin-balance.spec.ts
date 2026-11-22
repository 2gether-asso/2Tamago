import { createPet, gameHours, simulate, withRules, type PetState } from '@2tamago/core';
import type { BalanceInsightId } from '@2tamago/core/contracts';
import { buildBalanceReport, levelOf, type BalanceInput } from './admin-balance.js';

const rules = withRules();
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 20, 12);
const gameDay = gameHours(rules, 24);
const day = (t: number) => new Date(t).toISOString().slice(0, 10);

/** A hatched companion born `daysAgo` real days before NOW, with the given changes. */
function pet(daysAgo: number, overrides: Partial<PetState> = {}): PetState {
  const born = NOW - daysAgo * DAY;
  const egg = createPet({ name: 'P', species: 'mochi', color: 0, seed: 1, now: born }, rules);
  const state = simulate(egg, born + gameHours(rules, 0.2), rules).state;
  return { ...state, ...overrides };
}

function input(overrides: Partial<BalanceInput> = {}): BalanceInput {
  return {
    now: NOW,
    rules,
    timezone: 'UTC',
    pets: [],
    events: [],
    logins: [],
    missions: [],
    ...overrides,
  };
}

const insight = (report: ReturnType<typeof buildBalanceReport>, id: BalanceInsightId) =>
  report.insights.find((i) => i.id === id)!;

describe('buildBalanceReport', () => {
  it('says nothing it cannot back on an empty game', () => {
    const report = buildBalanceReport(input());
    expect(report.days).toHaveLength(14);
    expect(report.insights.every((i) => i.level === 'unknown')).toBe(true);
    expect(report.living).toBe(0);
  });

  it('flags Rascals among well cared-for adults, not among neglected ones', () => {
    // Born 20 days ago: about 20 game days lived at a time scale of 1.
    const days = (NOW - (NOW - 20 * DAY)) / gameDay;
    const cared = Array.from({ length: 6 }, (_, i) =>
      pet(20, { stage: 'adult', form: i < 3 ? 'rascal' : 'radiant', careMistakes: 0 }),
    );
    const neglected = Array.from({ length: 4 }, () =>
      pet(20, { stage: 'adult', form: 'rascal', careMistakes: Math.ceil(days * 2) }),
    );
    const report = buildBalanceReport(input({ pets: [...cared, ...neglected] }));
    const [good, , poor] = report.careBuckets;
    expect(good).toMatchObject({ key: 'good', pets: 6 });
    expect(good!.byForm.rascal).toBe(3);
    expect(poor).toMatchObject({ key: 'poor', pets: 4 });
    expect(insight(report, 'rascal_cared')).toMatchObject({ level: 'bad', value: 0.5, sample: 6 });
  });

  it('rates illnesses and care mistakes per living pet and game day, by kind and need', () => {
    const pets = Array.from({ length: 2 }, () => pet(30));
    const at = NOW - 2 * DAY;
    const events: BalanceInput['events'] = [
      { at, kind: 'illness', illness: 'infection' },
      { at, kind: 'illness', illness: 'indigestion' },
      { at, kind: 'mistake', need: 'hunger' },
      // Before the window: ignored.
      { at: NOW - 20 * DAY, kind: 'illness', illness: 'infection' },
    ];
    const report = buildBalanceReport(input({ pets, events }));
    const exposure = (2 * 14 * DAY) / gameDay;
    expect(insight(report, 'illness_rate').value).toBeCloseTo(2 / exposure, 3);
    expect(insight(report, 'illness_rate').level).toBe('good');
    expect(report.illnessesByKind).toMatchObject({ infection: 1, indigestion: 1, weakness: 0 });
    expect(report.mistakesByNeed.hunger).toBe(1);
    expect(report.days.find((d) => d.day === '2026-11-18')).toMatchObject({
      illnesses: 2,
      careMistakes: 1,
    });
  });

  it('measures how many wishes are granted, from the pets’ tallies', () => {
    const pets = [
      pet(5, { wishTally: { granted: 3, faded: 12 } }),
      pet(5, { wishTally: { granted: 2, faded: 8 } }),
    ];
    const report = buildBalanceReport(
      input({ pets, events: [{ at: NOW - DAY, kind: 'wish', wish: 'play' }] }),
    );
    expect(report.wishes).toMatchObject({ granted: 5, faded: 20 });
    expect(report.wishes.grantedByWish.play).toBe(1);
    expect(insight(report, 'wish_grant_rate')).toMatchObject({ value: 0.2, level: 'watch' });
  });

  it('follows the missions: finished days, and each mission offered and done', () => {
    const missions = Array.from({ length: 10 }, (_, i) => ({
      day: '2026-11-19',
      missions: [
        { id: 'play_games' as const, progress: 2 },
        { id: 'cuddles' as const, progress: i < 1 ? 5 : 0 },
      ],
    }));
    const report = buildBalanceReport(input({ missions }));
    expect(insight(report, 'missions_done')).toMatchObject({ value: 0.1, level: 'watch' });
    expect(report.missions.find((m) => m.id === 'play_games')).toMatchObject({
      offered: 10,
      done: 10,
      rate: 1,
    });
    expect(report.missions.find((m) => m.id === 'cuddles')?.rate).toBe(0.1);
    expect(report.days.find((d) => d.day === '2026-11-19')).toMatchObject({
      missionPlayers: 10,
      missionsAllDone: 1,
    });
  });

  it('counts daily players and how many of the week’s players come back each day', () => {
    const players = ['a', 'b', 'c', 'd', 'e', 'f'];
    // a and b every day of the last week, the others once.
    const logins = [
      ...Array.from({ length: 7 }, (_, d) => [
        { playerId: 'a', day: day(NOW - d * DAY) },
        { playerId: 'b', day: day(NOW - d * DAY) },
      ]).flat(),
      ...players.slice(2).map((playerId) => ({ playerId, day: day(NOW - 3 * DAY) })),
    ];
    const report = buildBalanceReport(input({ logins }));
    expect(report.days.at(-1)!.activePlayers).toBe(2);
    expect(report.days.find((d) => d.day === '2026-11-17')!.activePlayers).toBe(6);
    // (2 × 7 + 4) / 7 daily over 6 weekly players.
    expect(insight(report, 'stickiness').value).toBeCloseTo(18 / 7 / 6, 3);
    expect(insight(report, 'stickiness').level).toBe('watch');
  });

  it('tells departures (neglect) from retirements among the pets that ended lately', () => {
    const ended = (status: 'gone' | 'retired') =>
      pet(30, { status, endedAt: NOW - 3 * DAY, stage: 'adult' });
    const report = buildBalanceReport(
      input({ pets: [ended('gone'), ended('retired'), ended('retired'), ended('retired')] }),
    );
    expect(insight(report, 'departures')).toMatchObject({ value: 0.25, level: 'watch', sample: 4 });
  });
});

describe('levelOf', () => {
  it('reads the thresholds both ways', () => {
    const lower = { good: 0.1, bad: 0.2, higherIsBetter: false };
    expect(levelOf(0.1, lower)).toBe('good');
    expect(levelOf(0.15, lower)).toBe('watch');
    expect(levelOf(0.25, lower)).toBe('bad');
    const higher = { good: 0.4, bad: 0.2, higherIsBetter: true };
    expect(levelOf(0.5, higher)).toBe('good');
    expect(levelOf(0.3, higher)).toBe('watch');
    expect(levelOf(0.1, higher)).toBe('bad');
    expect(levelOf(null, higher)).toBe('unknown');
  });
});
