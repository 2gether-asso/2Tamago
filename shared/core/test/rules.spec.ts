import { describe, expect, it } from 'vitest';
import { applyRulesOverrides, withRules } from '../src/index.js';
import { rulesOverridesBody } from '../src/contracts/index.js';

describe('applyRulesOverrides', () => {
  const base = withRules();

  it('replaces scalars and merges object rules key by key', () => {
    const rules = applyRulesOverrides(base, {
      poopIntervalHours: 8,
      stageHours: { baby: 6 },
      awakeDecayPerHour: { satiety: 1 },
    });
    expect(rules.poopIntervalHours).toBe(8);
    expect(rules.stageHours).toEqual({ ...base.stageHours, baby: 6 });
    expect(rules.awakeDecayPerHour).toEqual({ ...base.awakeDecayPerHour, satiety: 1 });
  });

  it('does not mutate the base and keeps it when there is nothing to override', () => {
    const copy = structuredClone(base);
    applyRulesOverrides(base, { stageHours: { egg: 1 } });
    expect(base).toEqual(copy);
    expect(applyRulesOverrides(base, {})).toEqual(base);
  });
});

describe('rulesOverridesBody', () => {
  it('accepts valid tunings, including a null elder duration', () => {
    expect(rulesOverridesBody.safeParse({ stageHours: { elder: null }, maxPoops: 3 }).success).toBe(
      true,
    );
  });

  it('refuses fixed rules, unknown keys and nonsensical values', () => {
    for (const bad of [
      { timeScale: 60 },
      { stepMinutes: 1 },
      { unknown: 1 },
      { poopIntervalHours: 0 },
      { maxPoops: 1.5 },
      { stageHours: { baby: -1 } },
      { stageHours: { century: 1 } },
    ]) {
      expect(rulesOverridesBody.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
});
