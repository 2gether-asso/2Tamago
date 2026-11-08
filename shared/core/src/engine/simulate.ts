import { alignToGrid, gameHours, stepMs, type GameRules } from './rules.js';
import { modOf, traitsOf } from './traits.js';
import {
  STAGES,
  type Form,
  type Need,
  type PetEvent,
  type PetState,
  type Stage,
  type Stats,
} from './types.js';

export interface SimulationResult {
  state: PetState;
  events: PetEvent[];
}

/**
 * Advances a pet to `now`. Pure and deterministic: the result only depends on
 * the input state, `now` and the rules. Ticks are aligned on an absolute grid,
 * so simulating in one go or in many small calls gives the same result. That is
 * what lets the web app predict the pet between two API calls.
 */
export function simulate(input: PetState, now: number, rules: GameRules): SimulationResult {
  const state = structuredClone(input);
  const events: PetEvent[] = [];
  state.traits = traitsOf(state);
  if (state.status !== 'alive') return { state, events };

  const step = stepMs(rules);
  const target = alignToGrid(rules, now);
  let t = alignToGrid(rules, state.simulatedAt);
  let steps = 0;

  while (t + step <= target && steps < rules.maxStepsPerSimulation) {
    t += step;
    steps++;
    tick(state, t, rules, events);
    if (state.status !== 'alive') break;
  }
  state.simulatedAt = state.status === 'alive' ? Math.max(t, state.simulatedAt) : t;
  return { state, events };
}

function tick(state: PetState, t: number, rules: GameRules, events: PetEvent[]): void {
  const dtH = rules.stepMinutes / 60;

  if (state.stage === 'egg') {
    if (t - state.stageStartedAt >= gameHours(rules, rules.stageHours.egg ?? 0)) {
      hatch(state, t, rules);
      events.push({ type: 'hatched', at: t });
    }
    return;
  }

  decay(state, dtH, rules);
  sleepCycle(state, t, events);
  poop(state, t, rules, events);
  sickness(state, t, dtH, rules, events);
  health(state, t, dtH, rules, events);
  if (state.status !== 'alive') return;
  careMistakes(state, t, rules, events);
  tantrum(state, t, rules, events);
  aging(state, t, rules, events);
}

function hatch(state: PetState, t: number, rules: GameRules): void {
  state.stage = 'baby';
  state.stageStartedAt = t;
  state.stats = {
    satiety: 60,
    happiness: 60,
    energy: 80,
    hygiene: 100,
    health: 100,
    discipline: 0,
  };
  state.nextPoopAt = t + gameHours(rules, rules.poopIntervalHours);
  state.nextTantrumAt =
    t + gameHours(rules, rules.tantrumIntervalHours * modOf(state, 'tantrumInterval'));
}

function decay(state: PetState, dtH: number, rules: GameRules): void {
  const s = state.stats;
  const k = rules.stageNeediness[state.stage] * dtH;
  const messLoss = state.poops * rules.hygieneLossPerPoopPerHour * dtH;
  const satietyK = k * modOf(state, 'satietyDecay');
  const happinessK = k * modOf(state, 'happinessDecay');
  const hygieneK = k * modOf(state, 'hygieneDecay');
  if (state.asleep) {
    const d = rules.asleepDecayPerHour;
    s.satiety -= d.satiety * satietyK;
    s.happiness -= d.happiness * happinessK;
    s.hygiene -= d.hygiene * hygieneK + messLoss;
    s.energy += rules.energyRecoveryPerHour * modOf(state, 'energyRecovery') * dtH;
  } else {
    const d = rules.awakeDecayPerHour;
    s.satiety -= d.satiety * satietyK;
    s.happiness -= d.happiness * happinessK;
    s.hygiene -= d.hygiene * hygieneK + messLoss;
    s.energy -= d.energy * k * modOf(state, 'energyDecay');
  }
  s.discipline -= rules.disciplineDecayPerHour * dtH;
  clampStats(s);
}

function sleepCycle(state: PetState, t: number, events: PetEvent[]): void {
  if (state.asleep && state.stats.energy >= 100) {
    state.asleep = false;
    events.push({ type: 'woke_up', at: t });
  } else if (!state.asleep && !state.outing && state.stats.energy <= 0) {
    // Exhausted: falls asleep on its own, and is not happy about it.
    state.asleep = true;
    state.stats.happiness = clamp(state.stats.happiness - 10);
    events.push({ type: 'fell_asleep', at: t, data: { exhausted: true } });
  }
}

function poop(state: PetState, t: number, rules: GameRules, events: PetEvent[]): void {
  if (t < state.nextPoopAt) return;
  // Pets only poop when awake and at home; the timer waits otherwise.
  if (state.asleep || state.outing) return;
  state.nextPoopAt = t + gameHours(rules, rules.poopIntervalHours);
  if (state.poops < rules.maxPoops) {
    state.poops++;
    events.push({ type: 'pooped', at: t });
  }
}

function sickness(
  state: PetState,
  t: number,
  dtH: number,
  rules: GameRules,
  events: PetEvent[],
): void {
  if (state.sickSince !== null) return;
  const s = state.stats;
  const factors =
    (state.poops >= 3 ? 1 : 0) +
    (s.hygiene < 20 ? 1 : 0) +
    (s.satiety < 10 ? 1 : 0) +
    (state.weight > rules.overweightThreshold ? 0.5 : 0);
  if (factors === 0) {
    state.sicknessPressure = Math.max(0, state.sicknessPressure - dtH);
    return;
  }
  state.sicknessPressure += factors * dtH;
  if (state.sicknessPressure >= rules.sicknessThresholdHours) {
    state.sickSince = t;
    state.medicineDoses = 0;
    state.sicknessPressure = 0;
    events.push({ type: 'fell_ill', at: t });
  }
}

function health(
  state: PetState,
  t: number,
  dtH: number,
  rules: GameRules,
  events: PetEvent[],
): void {
  const s = state.stats;
  if (state.sickSince !== null)
    s.health -= rules.sickHealthLossPerHour * modOf(state, 'sickHealthLoss') * dtH;
  if (s.satiety <= 0) s.health -= rules.starvingHealthLossPerHour * dtH;
  if (state.sickSince === null && s.satiety > 40 && s.happiness > 30) {
    s.health += rules.healthRegenPerHour * dtH;
  }
  clampStats(s);

  if (s.health <= 0) {
    if (rules.departureEnabled) {
      state.status = 'gone';
      state.endedAt = t;
      state.asleep = false;
      events.push({ type: 'departed', at: t });
    } else {
      s.health = 1;
    }
  }
}

function careMistakes(state: PetState, t: number, rules: GameRules, events: PetEvent[]): void {
  const active: Record<Need, boolean> = {
    hunger: state.stats.satiety <= 0,
    sadness: state.stats.happiness <= 0,
    mess: state.poops >= rules.maxPoops,
    sickness: state.sickSince !== null,
  };
  const grace = gameHours(rules, rules.mistakeGraceHours);
  for (const need of Object.keys(active) as Need[]) {
    const tracker = state.needs[need];
    if (!active[need]) {
      state.needs[need] = null;
    } else if (!tracker) {
      state.needs[need] = { since: t, counted: false };
    } else if (!tracker.counted && t - tracker.since >= grace) {
      tracker.counted = true;
      state.careMistakes++;
      state.stageCareMistakes++;
      state.bond = clamp(state.bond - 5);
      events.push({ type: 'care_mistake', at: t, data: { need } });
    }
  }
}

function tantrum(state: PetState, t: number, rules: GameRules, events: PetEvent[]): void {
  if (state.stage === 'baby' || state.stage === 'elder') return;
  if (state.tantrumSince !== null) {
    if (t - state.tantrumSince >= gameHours(rules, rules.tantrumWindowHours)) {
      // Nobody reacted: the pet learns it can get away with it.
      state.tantrumSince = null;
      state.stats.discipline = clamp(state.stats.discipline - 10);
      state.nextTantrumAt =
        t + gameHours(rules, rules.tantrumIntervalHours * modOf(state, 'tantrumInterval'));
      events.push({ type: 'attention_ignored', at: t });
    }
    return;
  }
  if (t >= state.nextTantrumAt && !state.asleep && !state.outing) {
    state.tantrumSince = t;
    events.push({ type: 'attention_call', at: t });
  }
}

function aging(state: PetState, t: number, rules: GameRules, events: PetEvent[]): void {
  const hours = rules.stageHours[state.stage];
  if (hours === null || t - state.stageStartedAt < gameHours(rules, hours)) return;
  const next = STAGES[STAGES.indexOf(state.stage) + 1] as Stage | undefined;
  if (!next) return;
  const from = state.stage;
  state.stage = next;
  state.stageStartedAt = t;
  // Elders keep the form they had as adults.
  if (next !== 'elder') state.form = pickForm(state, from);
  state.stageCareMistakes = 0;
  events.push({ type: 'evolved', at: t, data: { from, to: next, form: state.form } });
}

/** Evolution branch, from the care received during the stage that just ended. */
export function pickForm(state: PetState, from: Stage): Form {
  const mistakes = state.stageCareMistakes;
  // Babies cannot be disciplined yet: only care and affection count.
  const disciplined = from === 'baby' || state.stats.discipline >= 50;
  const unruly = from !== 'baby' && state.stats.discipline < 25;
  const attached = state.bond >= (from === 'baby' ? 5 : 30);
  if (mistakes <= 1 && disciplined && attached) return 'radiant';
  if (mistakes >= 4 || unruly) return 'rascal';
  return 'gentle';
}

export function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

function clampStats(stats: Stats): void {
  for (const key of Object.keys(stats) as (keyof Stats)[]) stats[key] = clamp(stats[key]);
}
