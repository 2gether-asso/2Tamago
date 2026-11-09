import type { ItemId } from './catalog.js';
import { hashSeed, prng, traitsOf } from './traits.js';
import { STAGES, type PetEvent, type PetState, type Stage, type Temperament } from './types.js';
import type { WalkZoneId } from './zones.js';

/**
 * The character sheet: five statistics that grow with what the pet does, and the walk events
 * (a deterministic "loot table") with a small quest chain. Pure: nothing here throws a die, the
 * walk event is picked from a seed. Texts (stat names, events, quests) live in the web app.
 */
export const RPG_STATS = ['vigor', 'agility', 'wit', 'charm', 'luck'] as const;
export type RpgStat = (typeof RPG_STATS)[number];

/** Experience points needed for each point of a statistic. */
export const XP_PER_POINT = 10;
export const MAX_STAT = 20;
/** Past walk events kept in the sheet (the memory the quests read). */
export const HISTORY_SIZE = 12;

/** A quest is a chain of walk events: each one needs the step reached by the one before. */
export const QUEST_IDS = ['hermit'] as const;
export type QuestId = (typeof QUEST_IDS)[number];
export const QUESTS: Record<QuestId, { steps: number }> = {
  /** Meet the hermit, answer his riddle (needs wit), receive his thanks. */
  hermit: { steps: 3 },
};

/** The loot table: see `WALK_EVENTS`. */
export const WALK_EVENT_KINDS = ['nothing', 'npc', 'mishap', 'discovery', 'quest'] as const;
export type WalkEventKind = (typeof WALK_EVENT_KINDS)[number];

export interface WalkEventDef {
  kind: WalkEventKind;
  /** Relative chance among the events that are possible. */
  weight: number;
  minStage?: Stage;
  /** Absent = anywhere. */
  zones?: readonly WalkZoneId[];
  /** Needs this quest to be at exactly `step`; on success the quest moves to `step + 1`. */
  quest?: { id: QuestId; step: number };
  /** Needs this quest to be at `step`, without moving it (a retry). */
  questHold?: { id: QuestId; step: number };
  /** Needs a statistic to be at least (`atLeast`) or below (`below`) a value. */
  stat?: { stat: RpgStat; atLeast?: number; below?: number };
  xp?: Partial<Record<RpgStat, number>>;
  /** Changes of the pet's needs (a negative one of a mishap is softened by agility). */
  happiness?: number;
  satiety?: number;
  hygiene?: number;
  health?: number;
  bond?: number;
  /** Not the pet's: handed over by the server (see `resolveWalkEvent`). */
  coins?: number;
  item?: ItemId;
}

/** The ids are texts of the web app (`rpg.event.<id>`). */
export const WALK_EVENTS = {
  quiet_stroll: { kind: 'nothing', weight: 25 },
  sunny_spot: { kind: 'nothing', weight: 8, happiness: 6 },
  shiny_pebble: { kind: 'discovery', weight: 12, coins: 4, xp: { luck: 2 } },
  berry_patch: {
    kind: 'discovery',
    weight: 10,
    zones: ['meadow', 'forest'],
    satiety: 12,
    xp: { luck: 1 },
  },
  old_coin: { kind: 'discovery', weight: 6, minStage: 'teen', coins: 12, xp: { luck: 3 } },
  buried_treasure: {
    kind: 'discovery',
    weight: 4,
    minStage: 'adult',
    zones: ['beach'],
    coins: 30,
    item: 'starfish',
    xp: { luck: 4 },
  },
  friendly_snail: {
    kind: 'npc',
    weight: 10,
    zones: ['meadow'],
    bond: 1,
    happiness: 4,
    xp: { charm: 3 },
  },
  wise_owl: { kind: 'npc', weight: 8, minStage: 'teen', zones: ['forest'], xp: { wit: 4 } },
  crab_race: {
    kind: 'npc',
    weight: 8,
    minStage: 'adult',
    zones: ['beach'],
    happiness: 5,
    xp: { agility: 4 },
  },
  travelling_merchant: {
    kind: 'npc',
    weight: 5,
    minStage: 'teen',
    coins: 8,
    xp: { charm: 2 },
  },
  muddy_puddle: { kind: 'mishap', weight: 10, hygiene: -15, xp: { agility: 1 } },
  sudden_rain: { kind: 'mishap', weight: 8, happiness: -8, xp: { vigor: 2 } },
  thorny_bush: {
    kind: 'mishap',
    weight: 8,
    zones: ['forest'],
    health: -6,
    happiness: -4,
    xp: { agility: 2 },
  },
  crab_pinch: {
    kind: 'mishap',
    weight: 8,
    zones: ['beach'],
    health: -6,
    happiness: -4,
    xp: { agility: 2 },
  },
  hermit_meet: {
    kind: 'quest',
    weight: 40,
    minStage: 'child',
    zones: ['meadow', 'forest'],
    quest: { id: 'hermit', step: 0 },
    xp: { charm: 2 },
  },
  hermit_riddle: {
    kind: 'quest',
    weight: 40,
    quest: { id: 'hermit', step: 1 },
    stat: { stat: 'wit', atLeast: 2 },
    xp: { wit: 3 },
  },
  hermit_riddle_failed: {
    kind: 'quest',
    weight: 40,
    questHold: { id: 'hermit', step: 1 },
    stat: { stat: 'wit', below: 2 },
    xp: { wit: 5 },
  },
  hermit_gift: {
    kind: 'quest',
    weight: 40,
    quest: { id: 'hermit', step: 2 },
    coins: 40,
    item: 'flower_crown',
    happiness: 15,
    xp: { luck: 3, charm: 3 },
  },
} as const satisfies Record<string, WalkEventDef>;
export type WalkEventId = keyof typeof WALK_EVENTS;
export const WALK_EVENT_IDS = Object.keys(WALK_EVENTS) as WalkEventId[];

/** One line of the walk log. */
export interface WalkLogEntry {
  at: number;
  event: WalkEventId;
  zone: WalkZoneId;
}

/** What the pet has experienced, stored in `PetState.rpg` (absent until the first gain). */
export interface RpgSheet {
  /** Experience per statistic (missing = 0). */
  xp: Partial<Record<RpgStat, number>>;
  /** Quest progress: the step reached (missing = not started). See `QUESTS`. */
  quests: Partial<Record<QuestId, number>>;
  /** The latest walk events, oldest first. */
  history: WalkLogEntry[];
}

type Sheeted = Pick<PetState, 'rpg' | 'name' | 'bornAt' | 'traits'>;

/** The statistic each temperament starts one point ahead in. */
export const TEMPERAMENT_BONUS: Record<Temperament, RpgStat> = {
  greedy: 'vigor',
  sleepy: 'luck',
  cuddly: 'charm',
  prankster: 'agility',
  tidy: 'wit',
  sturdy: 'vigor',
};

export function xpOf(state: Pick<PetState, 'rpg'>, stat: RpgStat): number {
  return state.rpg?.xp[stat] ?? 0;
}

/** The value of one statistic: 1 at birth (2 for the temperament's own), up to `MAX_STAT`. */
export function statOf(state: Sheeted, stat: RpgStat): number {
  const bonus = TEMPERAMENT_BONUS[traitsOf(state).temperament] === stat ? 1 : 0;
  return Math.min(MAX_STAT, 1 + bonus + Math.floor(xpOf(state, stat) / XP_PER_POINT));
}

export interface CharacterSheet {
  stats: Record<RpgStat, number>;
  /** Experience towards the next point of each statistic (0 to `XP_PER_POINT` - 1). */
  progress: Record<RpgStat, number>;
  /** 1 at birth, plus one per point earned (the temperament's head start does not count). */
  level: number;
  quests: { id: QuestId; step: number; steps: number; done: boolean }[];
  history: WalkLogEntry[];
}

/** The sheet of a pet, ready to display or to use as an input of other rules. */
export function characterSheet(state: Sheeted): CharacterSheet {
  const stats = {} as Record<RpgStat, number>;
  const progress = {} as Record<RpgStat, number>;
  let level = 1;
  for (const stat of RPG_STATS) {
    stats[stat] = statOf(state, stat);
    progress[stat] = stats[stat] >= MAX_STAT ? 0 : xpOf(state, stat) % XP_PER_POINT;
    level += Math.floor(xpOf(state, stat) / XP_PER_POINT);
  }
  return {
    stats,
    progress,
    level,
    quests: QUEST_IDS.map((id) => {
      const step = state.rpg?.quests[id] ?? 0;
      return { id, step, steps: QUESTS[id].steps, done: step >= QUESTS[id].steps };
    }),
    history: state.rpg?.history ?? [],
  };
}

function sheetOf(state: PetState): RpgSheet {
  return (state.rpg ??= { xp: {}, quests: {}, history: [] });
}

/** Adds experience to a statistic (capped), and reports each point gained as a `stat_up` event. */
export function gainXp(
  state: PetState,
  stat: RpgStat,
  amount: number,
  at: number,
  events: PetEvent[],
): void {
  if (amount <= 0) return;
  const before = statOf(state, stat);
  const sheet = sheetOf(state);
  sheet.xp[stat] = Math.min((MAX_STAT - 1) * XP_PER_POINT, xpOf(state, stat) + amount);
  const after = statOf(state, stat);
  if (after > before) events.push({ type: 'stat_up', at, data: { stat, value: after } });
}

/** Whether an event may happen to this pet in this zone right now. */
export function walkEventPossible(state: PetState, zone: WalkZoneId, id: WalkEventId): boolean {
  const event: WalkEventDef = WALK_EVENTS[id];
  if (event.minStage && STAGES.indexOf(state.stage) < STAGES.indexOf(event.minStage)) return false;
  if (event.zones && !event.zones.includes(zone)) return false;
  const quest = event.quest ?? event.questHold;
  if (quest && (state.rpg?.quests[quest.id] ?? 0) !== quest.step) return false;
  if (event.stat) {
    const value = statOf(state, event.stat.stat);
    if (event.stat.atLeast !== undefined && value < event.stat.atLeast) return false;
    if (event.stat.below !== undefined && value >= event.stat.below) return false;
  }
  return true;
}

/** The weight of an event for this pet: luck makes discoveries more likely. */
function weightOf(state: PetState, id: WalkEventId): number {
  const event: WalkEventDef = WALK_EVENTS[id];
  const luck = event.kind === 'discovery' ? 1 + (statOf(state, 'luck') - 1) * 0.1 : 1;
  return event.weight * luck;
}

/** Picks the event of a walk. Same pet, zone and seed: same event. */
export function pickWalkEvent(state: PetState, zone: WalkZoneId, seed: number): WalkEventId {
  const possible = WALK_EVENT_IDS.filter((id) => walkEventPossible(state, zone, id));
  const total = possible.reduce((sum, id) => sum + weightOf(state, id), 0);
  let roll = prng(seed)() * total;
  for (const id of possible) {
    roll -= weightOf(state, id);
    if (roll < 0) return id;
  }
  return 'quiet_stroll';
}

/**
 * Seed of a walk when the caller gives none: derived from the pet and the walk's start, so a
 * walk always has the same event (it cannot be re-rolled by asking again).
 */
export function walkSeed(state: Pick<PetState, 'name' | 'bornAt' | 'outing'>): number {
  return hashSeed(`${state.name}:${state.bornAt}:${state.outing?.startedAt ?? 0}`);
}

/**
 * Plays the event of a walk ending at `at`: picks it, applies what it does to the pet (needs,
 * experience, quest, log) and reports it as a `walk_event` PetEvent. Coins and the item are not
 * the pet's: they are in the event's data (`coins`, `item`) for the server to hand over.
 */
export function resolveWalkEvent(
  state: PetState,
  zone: WalkZoneId,
  seed: number,
  at: number,
  events: PetEvent[],
): WalkEventId {
  const id = pickWalkEvent(state, zone, seed);
  const event: WalkEventDef = WALK_EVENTS[id];
  const s = state.stats;
  const clamp = (n: number) => Math.max(0, Math.min(100, n));
  // Agility softens a mishap: one point of loss less per two points above the first.
  const soften = (n: number) =>
    event.kind === 'mishap' && n < 0
      ? Math.min(0, n + Math.floor((statOf(state, 'agility') - 1) / 2))
      : n;
  if (event.happiness) s.happiness = clamp(s.happiness + soften(event.happiness));
  if (event.satiety) s.satiety = clamp(s.satiety + soften(event.satiety));
  if (event.hygiene) s.hygiene = clamp(s.hygiene + soften(event.hygiene));
  if (event.health) s.health = clamp(s.health + soften(event.health));
  if (event.bond) state.bond = clamp(state.bond + event.bond);

  const data: NonNullable<PetEvent['data']> = { event: id, kind: event.kind, zone };
  if (event.coins) data.coins = event.coins;
  if (event.item) data.item = event.item;
  const quest = event.quest ?? event.questHold;
  if (quest) {
    const step = event.quest ? quest.step + 1 : quest.step;
    sheetOf(state).quests[quest.id] = step;
    data.quest = quest.id;
    data.step = step;
    data.questDone = step >= QUESTS[quest.id].steps;
  }
  events.push({ type: 'walk_event', at, data });
  for (const [stat, amount] of Object.entries(event.xp ?? {})) {
    gainXp(state, stat as RpgStat, amount, at, events);
  }
  const sheet = sheetOf(state);
  sheet.history = [...sheet.history, { at, event: id, zone }].slice(-HISTORY_SIZE);
  return id;
}
