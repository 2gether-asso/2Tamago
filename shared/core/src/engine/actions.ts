import { getItem, isAccessory, isSnack, type ItemId } from './catalog.js';
import { recordMeal } from './diet.js';
import { GameError } from './errors.js';
import { alignToGrid, gameHours, type GameRules } from './rules.js';
import { clamp, endVacation, simulate } from './simulate.js';
import { isNight } from './night.js';
import { gainXp, resolveWalkEvent, walkSeed } from './rpg.js';
import { WORK } from './work.js';
import { hashSeed, modOf, rollTraits } from './traits.js';
import { DEFAULT_ZONE, WALK_ZONES, zoneOpenTo, type WalkZoneId } from './zones.js';
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
  /** Without an item: the free ration. With a meal: its satiety, its food group. */
  | { type: 'feed'; item?: ItemId }
  | { type: 'treat'; item: ItemId }
  | { type: 'play'; score: number }
  | { type: 'clean' }
  /** Without an item: the free, weak care. With a medicine: its effect. */
  | { type: 'medicine'; item?: ItemId }
  | { type: 'sleep' }
  | { type: 'wake' }
  | { type: 'lights'; on: boolean }
  | { type: 'praise' }
  | { type: 'scold' }
  | { type: 'caress' }
  | { type: 'train'; trick: TrickId }
  /** A job: the server pays it (see `petWage`) and keeps the cooldown; not sent by clients. */
  | { type: 'work' }
  | { type: 'equip'; item: ItemId | null }
  | { type: 'retire' }
  | { type: 'startVacation' }
  | { type: 'endVacation' };

/**
 * What a caretaker may do while a pet is in daycare: the day-to-day care, not what only its owner
 * decides (training, walks, items, vacations, retiring). The API enforces the list.
 */
export const CARETAKER_ACTION_TYPES = [
  'feed',
  'clean',
  'medicine',
  'sleep',
  'wake',
  'lights',
  'praise',
  'scold',
  'caress',
] as const satisfies readonly OwnerAction['type'][];
export type CaretakerActionType = (typeof CARETAKER_ACTION_TYPES)[number];

/** Actions triggered by the server: outings, and what other players do. */
export type SystemAction =
  | { type: 'startOuting'; zone?: WalkZoneId }
  /** `seed` picks the walk event (default: derived from the pet and the walk, see `walkSeed`). */
  | { type: 'endOuting'; seed?: number }
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
  // Paused: the only thing left to do is to bring it back.
  if (state.vacationSince != null && action.type !== 'endVacation') {
    throw new GameError('on_vacation');
  }

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
      if (s.satiety >= rules.fullSatiety) throw new GameError('not_hungry');
      if (action.item === undefined) {
        add('satiety', rules.freeMealSatiety);
        state.weight += 1;
        break;
      }
      const meal = getItem(action.item);
      if (meal?.kind !== 'meal') throw new GameError('unknown_item');
      add('satiety', meal.satiety);
      state.weight += meal.weight;
      recordMeal(state, meal.group, rules);
      break;
    }
    case 'treat':
    case 'visitorTreat': {
      requireAwake();
      const item = getItem(action.item);
      if (!item || !isSnack(action.item) || item.kind !== 'snack')
        throw new GameError('unknown_item');
      // Stuffing a full pet with treats: it only gets fatter.
      if (s.satiety >= rules.fullSatiety) state.weight += rules.overfeedWeight;
      for (const [key, value] of Object.entries(item.effects)) add(key as keyof typeof s, value);
      state.weight += item.weight;
      recordMeal(state, item.group ?? 'sweet', rules);
      if (action.type === 'treat') state.bond = clamp(state.bond + 1);
      break;
    }
    case 'play': {
      requireAwake();
      if (s.energy < 10) throw new GameError('too_tired');
      const left = playChargesLeft(state, at, rules);
      if (left < 1) throw new GameError('tired_of_playing');
      // Settle the refill, then spend one game.
      state.playCharges = left - 1;
      state.playChargesAt = at;
      const score = clamp(Math.round(action.score), 0, 3);
      add('happiness', 10 + score * 5);
      add('energy', -10);
      add('satiety', -3);
      state.weight = Math.max(5, state.weight - 1);
      state.bond = clamp(state.bond + 2);
      gainXp(state, 'agility', 2, at, events);
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
      let dose = rules.freeMedicineDose;
      let cure = false;
      if (action.item !== undefined) {
        const medicine = getItem(action.item);
        if (medicine?.kind !== 'medicine') throw new GameError('unknown_item');
        if (medicine.cures === 'any') dose = 1;
        else if (medicine.cures === state.illness) cure = true;
        else dose = rules.wrongMedicineDose;
      }
      state.medicineDoses += dose;
      add('happiness', action.item === undefined ? -5 : -2);
      if (cure || state.medicineDoses >= rules.medicineDoses) {
        const illness = state.illness ?? null;
        state.sickSince = null;
        state.illness = null;
        state.medicineDoses = 0;
        events.push({ type: 'cured', at, data: { illness } });
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
      // Waking it up means the lights are on again, or it would go straight back to sleep.
      state.lightsOff = false;
      add('happiness', -10);
      events.push({ type: 'woke_up', at });
      break;
    }
    case 'lights': {
      requireHome();
      if (action.on) {
        state.lightsOff = false;
      } else {
        if (!isNight(rules, at, state.stage)) throw new GameError('not_night');
        state.lightsOff = true;
      }
      break;
    }
    case 'praise': {
      requireAwake();
      if (!praiseReady(state, at, rules)) throw new GameError('praise_cooldown');
      state.lastPraiseAt = at;
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
        gainXp(state, 'charm', 1, at, events);
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
      gainXp(state, 'wit', 3, at, events);
      const after = trickLevel(state.tricks[action.trick]);
      if (after > before) {
        events.push({ type: 'trick_level_up', at, data: { trick: action.trick, level: after } });
      }
      break;
    }
    case 'work': {
      requireAwake();
      if (state.stage === 'baby') throw new GameError('too_young');
      if (s.energy < WORK.petMinEnergy) throw new GameError('too_tired');
      if (s.satiety < WORK.petMinSatiety) throw new GameError('too_hungry');
      add('energy', -WORK.petCost.energy);
      add('satiety', -WORK.petCost.satiety);
      add('happiness', -WORK.petCost.happiness);
      add('hygiene', -WORK.petCost.hygiene);
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
    case 'startVacation': {
      requireHome();
      const coolingDown =
        state.vacationEndedAt != null &&
        at - state.vacationEndedAt < gameHours(rules, rules.vacationCooldownHours);
      if (coolingDown) throw new GameError('vacation_cooldown');
      state.vacationSince = at;
      events.push({ type: 'vacation_started', at });
      break;
    }
    case 'endVacation': {
      if (state.vacationSince == null) throw new GameError('not_on_vacation');
      endVacation(state, at, rules, events, false);
      break;
    }
    case 'startOuting': {
      requireAwake();
      if (state.stage === 'baby') throw new GameError('too_young');
      const zone = WALK_ZONES[action.zone ?? DEFAULT_ZONE];
      if (!zoneOpenTo(zone, state.stage)) throw new GameError('zone_locked');
      if (s.energy < zone.energyCost + 5) throw new GameError('too_tired');
      state.outing = {
        startedAt: at,
        endsAt: at + gameHours(rules, rules.outingHours * zone.durationFactor),
        zone: zone.id,
      };
      break;
    }
    case 'endOuting': {
      if (!state.outing) throw new GameError('not_away');
      if (at < state.outing.endsAt) throw new GameError('outing_not_finished');
      const zone = WALK_ZONES[state.outing.zone ?? DEFAULT_ZONE];
      const seed = action.seed ?? walkSeed(state);
      state.outing = null;
      add('happiness', 15);
      add('energy', -zone.energyCost);
      add('satiety', -zone.satietyCost);
      state.weight = Math.max(5, state.weight - 2);
      state.bond = clamp(state.bond + zone.bondGain);
      gainXp(state, 'vigor', zone.vigorXp, at, events);
      resolveWalkEvent(state, zone.id, seed, at, events);
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

/** Games the pet is still willing to play at `now` (the quota refills one by one over time). */
export function playChargesLeft(state: PetState, now: number, rules: GameRules): number {
  const max = rules.playMaxCharges;
  if (state.playCharges === undefined || state.playChargesAt === undefined) return max;
  const refill = rules.playRefillSeconds * 1000;
  const back = refill > 0 ? Math.floor(Math.max(0, now - state.playChargesAt) / refill) : max;
  return Math.min(max, state.playCharges + back);
}

/**
 * When the next game comes back (real ms), or null when the quota is full. Counted from the last
 * time a game was played, so waiting only works in whole steps.
 */
export function nextPlayChargeAt(state: PetState, now: number, rules: GameRules): number | null {
  if (playChargesLeft(state, now, rules) >= rules.playMaxCharges) return null;
  const refill = rules.playRefillSeconds * 1000;
  const at = state.playChargesAt ?? now;
  return at + (Math.floor(Math.max(0, now - at) / refill) + 1) * refill;
}

export function praiseReady(state: PetState, now: number, rules: GameRules): boolean {
  return (
    state.lastPraiseAt == null || now - state.lastPraiseAt >= rules.praiseCooldownSeconds * 1000
  );
}

/** 0 = unknown, 1 = learning, 2 = known, 3 = mastered. */
export function trickLevel(progress: number): 0 | 1 | 2 | 3 {
  if (progress >= 100) return 3;
  if (progress >= 50) return 2;
  if (progress > 0) return 1;
  return 0;
}
