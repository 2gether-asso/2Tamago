import { getItem, isAccessory, isSnack, type ItemId } from './catalog.js';
import { GameError } from './errors.js';
import { alignToGrid, gameHours, type GameRules } from './rules.js';
import { clamp, simulate } from './simulate.js';
import { hashSeed, modOf, rollTraits } from './traits.js';
import { type PetEvent, type PetState, type Species, type TrickId, TRICKS } from './types.js';

export interface NewPetInput {
  name: string;
  species: Species;
  color: number;
  /** Randomness for the traits; defaults to a hash of the name and the creation time. */
  seed?: number;
  now: number;
}

/** A fresh egg. */
export function createPet(input: NewPetInput, rules: GameRules): PetState {
  const t = alignToGrid(rules, input.now);
  return {
    v: 1,
    name: input.name,
    species: input.species,
    color: Math.round(clamp(input.color, 0, 359)),
    traits: rollTraits(input.seed ?? hashSeed(`${input.name}:${input.now}`)),
    status: 'alive',
    stage: 'egg',
    form: null,
    bornAt: input.now,
    stageStartedAt: t,
    endedAt: null,
    simulatedAt: t,
    stats: { satiety: 100, happiness: 100, energy: 100, hygiene: 100, health: 100, discipline: 0 },
    weight: 10,
    bond: 0,
    asleep: false,
    poops: 0,
    nextPoopAt: Number.MAX_SAFE_INTEGER,
    sickSince: null,
    medicineDoses: 0,
    sicknessPressure: 0,
    careMistakes: 0,
    stageCareMistakes: 0,
    needs: { hunger: null, sadness: null, mess: null, sickness: null },
    tantrumSince: null,
    nextTantrumAt: Number.MAX_SAFE_INTEGER,
    outing: null,
    tricks: Object.fromEntries(TRICKS.map((trick) => [trick, 0])) as Record<TrickId, number>,
    lastCaressAt: null,
    equipped: null,
  };
}

/** Actions the owner can do on their own pet. */
export type OwnerAction =
  | { type: 'feed' }
  | { type: 'treat'; item: ItemId }
  | { type: 'play'; score: number }
  | { type: 'clean' }
  | { type: 'medicine' }
  | { type: 'sleep' }
  | { type: 'wake' }
  | { type: 'praise' }
  | { type: 'scold' }
  | { type: 'caress' }
  | { type: 'train'; trick: TrickId }
  | { type: 'equip'; item: ItemId | null }
  | { type: 'retire' };

/** Actions triggered by the server: outings, and what other players do. */
export type SystemAction =
  | { type: 'startOuting' }
  | { type: 'endOuting' }
  | { type: 'visitorCaress' }
  | { type: 'visitorTreat'; item: ItemId };

export type PetAction = OwnerAction | SystemAction;

export interface ActionResult {
  state: PetState;
  /** Events from the simulation up to `now`, then from the action itself. */
  events: PetEvent[];
}

/**
 * Brings the pet up to date, then applies the action at `now`.
 * Throws a `GameError` when the action is not possible.
 */
export function applyAction(
  input: PetState,
  action: PetAction,
  now: number,
  rules: GameRules,
): ActionResult {
  const { state, events } = simulate(input, now, rules);
  const at = now;
  const s = state.stats;
  const add = (key: keyof typeof s, amount: number) => (s[key] = clamp(s[key] + amount));

  if (state.status !== 'alive') throw new GameError('pet_gone');
  if (state.stage === 'egg') throw new GameError('still_an_egg');

  const requireHome = () => {
    if (state.outing) throw new GameError('away');
  };
  const requireAwake = () => {
    requireHome();
    if (state.asleep) throw new GameError('asleep');
  };

  switch (action.type) {
    case 'feed': {
      requireAwake();
      if (s.satiety >= 95) throw new GameError('not_hungry');
      add('satiety', 35);
      state.weight += 1;
      break;
    }
    case 'treat':
    case 'visitorTreat': {
      requireAwake();
      const item = getItem(action.item);
      if (!item || !isSnack(action.item) || item.kind !== 'snack')
        throw new GameError('unknown_item');
      for (const [key, value] of Object.entries(item.effects)) add(key as keyof typeof s, value);
      state.weight += item.weight;
      if (action.type === 'treat') state.bond = clamp(state.bond + 1);
      break;
    }
    case 'play': {
      requireAwake();
      if (s.energy < 10) throw new GameError('too_tired');
      const score = clamp(Math.round(action.score), 0, 3);
      add('happiness', 10 + score * 5);
      add('energy', -10);
      add('satiety', -3);
      state.weight = Math.max(5, state.weight - 1);
      state.bond = clamp(state.bond + 2);
      break;
    }
    case 'clean': {
      requireHome();
      state.poops = 0;
      add('hygiene', 40);
      break;
    }
    case 'medicine': {
      requireHome();
      if (state.sickSince === null) throw new GameError('not_sick');
      state.medicineDoses++;
      add('happiness', -5);
      if (state.medicineDoses >= rules.medicineDoses) {
        state.sickSince = null;
        state.medicineDoses = 0;
        events.push({ type: 'cured', at });
      }
      break;
    }
    case 'sleep': {
      requireAwake();
      if (s.energy >= 90) throw new GameError('not_sleepy');
      state.asleep = true;
      events.push({ type: 'fell_asleep', at, data: { exhausted: false } });
      break;
    }
    case 'wake': {
      requireHome();
      if (!state.asleep) throw new GameError('awake');
      state.asleep = false;
      add('happiness', -10);
      events.push({ type: 'woke_up', at });
      break;
    }
    case 'praise': {
      requireAwake();
      add('happiness', 5);
      state.bond = clamp(state.bond + 1);
      // Rewarding a tantrum teaches the wrong lesson.
      if (state.tantrumSince !== null) add('discipline', -5);
      break;
    }
    case 'scold': {
      requireAwake();
      if (state.tantrumSince !== null) {
        add('discipline', 25);
        state.tantrumSince = null;
        state.nextTantrumAt =
          alignToGrid(rules, at) +
          gameHours(rules, rules.tantrumIntervalHours * modOf(state, rules, 'tantrumInterval'));
      } else {
        // Scolding for nothing hurts.
        add('happiness', -10);
        state.bond = clamp(state.bond - 3);
      }
      break;
    }
    case 'caress': {
      requireHome();
      if (caressReady(state, at, rules)) {
        add('happiness', 3);
        state.bond = clamp(state.bond + modOf(state, rules, 'caressBond'));
        state.lastCaressAt = at;
      }
      break;
    }
    case 'visitorCaress': {
      requireHome();
      add('happiness', 8);
      break;
    }
    case 'train': {
      requireAwake();
      if (state.stage === 'baby') throw new GameError('too_young');
      if (s.energy < 15) throw new GameError('too_tired');
      if (s.satiety < 20) throw new GameError('too_hungry');
      add('energy', -8);
      add('satiety', -3);
      const before = trickLevel(state.tricks[action.trick]);
      const focus = s.happiness >= 50 ? 1 : 0.5;
      const gain = 8 * (1 + s.discipline / 100) * focus;
      state.tricks[action.trick] = clamp(state.tricks[action.trick] + gain);
      state.bond = clamp(state.bond + 1);
      const after = trickLevel(state.tricks[action.trick]);
      if (after > before) {
        events.push({ type: 'trick_level_up', at, data: { trick: action.trick, level: after } });
      }
      break;
    }
    case 'equip': {
      if (action.item !== null && !isAccessory(action.item)) throw new GameError('unknown_item');
      state.equipped = action.item;
      break;
    }
    case 'retire': {
      if (state.stage !== 'elder') throw new GameError('not_elder');
      state.status = 'retired';
      state.endedAt = at;
      events.push({ type: 'retired', at });
      break;
    }
    case 'startOuting': {
      requireAwake();
      if (state.stage === 'baby') throw new GameError('too_young');
      if (s.energy < 20) throw new GameError('too_tired');
      state.outing = { startedAt: at, endsAt: at + gameHours(rules, rules.outingHours) };
      break;
    }
    case 'endOuting': {
      if (!state.outing) throw new GameError('not_away');
      if (at < state.outing.endsAt) throw new GameError('outing_not_finished');
      state.outing = null;
      add('happiness', 15);
      add('energy', -15);
      add('satiety', -10);
      state.weight = Math.max(5, state.weight - 2);
      state.bond = clamp(state.bond + 3);
      break;
    }
    default: {
      const exhaustive: never = action;
      throw new Error(`Unknown action ${JSON.stringify(exhaustive)}`);
    }
  }

  return { state, events };
}

export function caressReady(state: PetState, now: number, rules: GameRules): boolean {
  return (
    state.lastCaressAt === null || now - state.lastCaressAt >= rules.caressCooldownSeconds * 1000
  );
}

/** 0 = unknown, 1 = learning, 2 = known, 3 = mastered. */
export function trickLevel(progress: number): 0 | 1 | 2 | 3 {
  if (progress >= 100) return 3;
  if (progress >= 50) return 2;
  if (progress > 0) return 1;
  return 0;
}
