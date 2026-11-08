/**
 * API contracts shared by the API (request validation) and the web app (typed
 * client). Request bodies are Zod schemas; responses are plain types.
 */
import { z } from 'zod';
import { ITEM_IDS, type ItemId } from '../engine/catalog.js';
import type { GameErrorCode } from '../engine/errors.js';
import type { Alert, Mood } from '../engine/view.js';
import type { GameRules, RulesOverrides } from '../engine/rules.js';
import {
  SPECIES,
  TEMPERAMENTS,
  TRICKS,
  type Form,
  type PetEvent,
  type PetState,
  type PetTraits,
  type Species,
  type Stage,
  type Stats,
  type Temperament,
} from '../engine/types.js';

const itemId = z.enum(ITEM_IDS as [ItemId, ...ItemId[]]);
const petName = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .regex(/^[\p{L}\p{N} '’-]+$/u, 'Lettres, chiffres, espaces et tirets uniquement');

// ---------------------------------------------------------------- requests

const nonNegative = z.number().min(0).max(1_000_000);
const positive = z.number().gt(0).max(1_000_000);
const perStage = z
  .object({
    egg: nonNegative,
    baby: nonNegative,
    child: nonNegative,
    teen: nonNegative,
    adult: nonNegative,
    elder: nonNegative,
  })
  .partial()
  .strict();

const hour = z.number().int().min(0).max(23);
const bedtime = z.object({ startHour: hour, endHour: hour }).partial().strict();

const modifier = z.number().min(0.5).max(2);
const temperamentMods = z
  .object({
    satietyDecay: modifier,
    happinessDecay: modifier,
    energyDecay: modifier,
    hygieneDecay: modifier,
    energyRecovery: modifier,
    sickHealthLoss: modifier,
    caressBond: modifier,
    tantrumInterval: modifier,
  })
  .partial()
  .strict();

/** Game tunings editable by an admin (see `RulesOverrides`). Unknown keys are refused. */
export const rulesOverridesBody = z
  .object({
    stageHours: perStage.extend({ elder: nonNegative.nullable().optional() }),
    stageNeediness: perStage,
    awakeDecayPerHour: z
      .object({
        satiety: nonNegative,
        happiness: nonNegative,
        energy: nonNegative,
        hygiene: nonNegative,
      })
      .partial()
      .strict(),
    asleepDecayPerHour: z
      .object({ satiety: nonNegative, happiness: nonNegative, hygiene: nonNegative })
      .partial()
      .strict(),
    energyRecoveryPerHour: nonNegative,
    disciplineDecayPerHour: nonNegative,
    hygieneLossPerPoopPerHour: nonNegative,
    poopIntervalHours: positive,
    maxPoops: z.number().int().min(0).max(100),
    sicknessThresholdHours: positive,
    medicineDoses: z.number().int().min(1).max(100),
    sickHealthLossPerHour: nonNegative,
    starvingHealthLossPerHour: nonNegative,
    healthRegenPerHour: nonNegative,
    overweightThreshold: nonNegative,
    mistakeGraceHours: nonNegative,
    tantrumIntervalHours: positive,
    tantrumWindowHours: nonNegative,
    outingHours: nonNegative,
    caressCooldownSeconds: nonNegative,
    departureEnabled: z.boolean(),
    night: z
      .object({
        startHour: hour,
        endHour: hour,
        stages: z
          .object({
            baby: bedtime,
            child: bedtime,
            teen: bedtime,
            adult: bedtime,
            elder: bedtime,
          })
          .partial()
          .strict(),
        clockOffsetHours: z.number().min(-12).max(14),
        awakeHappinessFactor: z.number().min(1).max(5),
      })
      .partial()
      .strict(),
    temperaments: z
      .object(
        Object.fromEntries(TEMPERAMENTS.map((t) => [t, temperamentMods])) as Record<
          Temperament,
          typeof temperamentMods
        >,
      )
      .partial()
      .strict(),
  })
  .partial()
  .strict() satisfies z.ZodType<RulesOverrides>;
export type RulesOverridesBody = z.infer<typeof rulesOverridesBody>;

export const devLoginBody = z.object({
  name: z.string().trim().min(2).max(32),
});
export const FEEDBACK_TYPES = ['bug', 'idea', 'other'] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export const feedbackBody = z.object({
  type: z.enum(FEEDBACK_TYPES),
  message: z.string().trim().min(10).max(2000),
  /** Route the player was on, to help reproduce. */
  page: z.string().max(200).optional(),
});
export type FeedbackBody = z.infer<typeof feedbackBody>;

export type DevLoginBody = z.infer<typeof devLoginBody>;

export const adoptBody = z.object({
  name: petName,
  species: z.enum(SPECIES),
  color: z.number().int().min(0).max(359),
});
export type AdoptBody = z.infer<typeof adoptBody>;

export const ownerActionBody = z.discriminatedUnion('type', [
  z.object({ type: z.literal('feed') }),
  z.object({ type: z.literal('treat'), item: itemId }),
  z.object({ type: z.literal('play'), score: z.number().int().min(0).max(3) }),
  z.object({ type: z.literal('clean') }),
  z.object({ type: z.literal('medicine') }),
  z.object({ type: z.literal('sleep') }),
  z.object({ type: z.literal('wake') }),
  z.object({ type: z.literal('lights'), on: z.boolean() }),
  z.object({ type: z.literal('praise') }),
  z.object({ type: z.literal('scold') }),
  z.object({ type: z.literal('caress') }),
  z.object({ type: z.literal('train'), trick: z.enum(TRICKS) }),
  z.object({ type: z.literal('equip'), item: itemId.nullable() }),
  z.object({ type: z.literal('retire') }),
]);
export type OwnerActionBody = z.infer<typeof ownerActionBody>;

export const buyBody = z.object({
  item: itemId,
  quantity: z.number().int().min(1).max(20).default(1),
});
export type BuyBody = z.infer<typeof buyBody>;

export const giftBody = z.object({ item: itemId });
export type GiftBody = z.infer<typeof giftBody>;

export const uuidParam = z.uuid();

// --------------------------------------------------------------- responses

/** Admin view of the game rules: what the code and environment give, what is overridden, the result. */
export interface AdminRulesResponse {
  base: GameRules;
  overrides: RulesOverrides;
  effective: GameRules;
}

/** Aggregates for one group of companions (a temperament, a species), to compare groups. */
export interface GroupStats {
  key: string;
  /** Hatched companions of the group, alive or not. */
  pets: number;
  alive: number;
  retired: number;
  departed: number;
  /** Departed over ended (retired or departed), `null` while none has ended. */
  departureRate: number | null;
  /** Mean life of the ended companions, in game days. */
  avgLifespanDays: number | null;
  /** Care mistakes per game day lived, over the whole group. */
  mistakesPerDay: number | null;
  /** Means over the living companions. */
  avgBond: number | null;
  avgHappiness: number | null;
}

export interface DailyActivity {
  /** `YYYY-MM-DD` in the game time zone. */
  day: string;
  newPlayers: number;
  caresses: number;
  gifts: number;
  walks: number;
}

/** What the admin sees about the whole game: adoption, activity, economy and balance. */
export interface AdminStats {
  generatedAt: number;
  players: {
    total: number;
    newLast7Days: number;
    /** Seen in the last 24 hours (the daily bonus counts as being seen). */
    activeToday: number;
    activeLast7Days: number;
    withLivingPet: number;
  };
  pets: {
    total: number;
    hatched: number;
    alive: number;
    retired: number;
    departed: number;
    /** Living companions per stage. */
    byStage: Record<Stage, number>;
    /** Hatched companions per evolution form (the form they had last). */
    byForm: Record<Form, number>;
  };
  /** Means over the living, hatched companions. */
  averages: Stats & { bond: number };
  economy: {
    coinsInCirculation: number;
    averageCoins: number;
    items: { itemId: string; quantity: number }[];
  };
  activity: {
    /** The last 14 days, oldest first. */
    days: DailyActivity[];
    encounters: number;
  };
  /** Species are cosmetic: their rows should look alike. Temperaments should be close, not equal. */
  balance: {
    byTemperament: GroupStats[];
    bySpecies: GroupStats[];
  };
}

export interface PlayerDto {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  coins: number;
  isAdmin: boolean;
}

export interface PetDto {
  id: string;
  ownerId: string;
  ownerName: string;
  state: PetState;
  mood: Mood;
  alerts: Alert[];
}

export type Inventory = Partial<Record<ItemId, number>>;

/** Public settings the web app needs before anyone is signed in. */
export interface ClientConfig {
  /** DSN for browser error tracking, `null` when it is off. */
  sentryDsn: string | null;
  /** Whether the feedback form can deliver (the API has a `SENTRY_DSN`). */
  feedbackEnabled: boolean;
}

export interface MeResponse {
  player: PlayerDto;
  pet: PetDto | null;
  inventory: Inventory;
  /** Server clock, so the client can correct its own when predicting. */
  serverTime: number;
}

/**
 * A short message to show as a toast. The API sends a code and its parameters, not a sentence:
 * the web app writes it in the player's language.
 */
export type Notice =
  | { code: 'coins_earned'; count: number }
  | { code: 'pet_happy'; petName: string }
  | { code: 'gift_given'; item: ItemId; petName: string }
  | { code: 'walk_found_coins'; count: number }
  | { code: 'walk_found_item'; item: ItemId }
  | { code: 'walk_met'; petName: string; ownerName: string };

export interface ActionResponse {
  pet: PetDto;
  events: PetEvent[];
  coins: number;
  notices: Notice[];
}

export interface WalkEncounter {
  petId: string;
  name: string;
  species: Species;
  color: number;
  ownerName: string;
}

export interface WalkResponse extends ActionResponse {
  found: { coins: number; items: ItemId[] };
  encounters: WalkEncounter[];
}

/** What a player has done so far, shown on their profile. */
export interface PlayerStats {
  /** Companions raised so far, the living one included. */
  companions: number;
  retired: number;
  departed: number;
  /** Age in game days of the longest-lived companion (the living one counts). */
  bestAgeDays: number;
  caressesGiven: number;
  giftsGiven: number;
  caressesReceived: number;
  giftsReceived: number;
  walks: number;
  encounters: number;
}

export interface PlayerProfile {
  player: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    /** When they first signed in (epoch ms). */
    memberSince: number;
    isYou: boolean;
  };
  stats: PlayerStats;
  /** Their living companion, brought up to date. */
  pet: PetDto | null;
}

export interface VillagePet {
  petId: string;
  name: string;
  species: Species;
  stage: Stage;
  form: Form | null;
  color: number;
  /** `null` while the pet is an egg. */
  traits: PetTraits | null;
  equipped: string | null;
  mood: Mood;
  ownerName: string;
  caressedToday: boolean;
}

export interface VisitResponse {
  pet: PetDto;
  caressedToday: boolean;
}

export type ActivityKind =
  'pet_event' | 'visit_caress' | 'visit_gift' | 'encounter' | 'daily_bonus';

export interface ActivityDto {
  id: string;
  kind: ActivityKind;
  data: Record<string, unknown>;
  createdAt: number;
  read: boolean;
}

export interface AlbumEntry {
  petId: string;
  name: string;
  species: Species;
  stage: Stage;
  form: Form | null;
  color: number;
  traits: PetTraits;
  status: 'gone' | 'retired';
  bornAt: number;
  endedAt: number | null;
}

/**
 * Codes the API adds to its errors, next to the engine's `GameErrorCode`s. The web app writes a
 * message for each one (`error.<code>`): add the translation when you add a code.
 */
export const API_ERROR_CODES = [
  'already_caressed',
  'already_has_pet',
  'feedback_disabled',
  'missing_item',
  'no_pet',
  'no_player',
  'not_enough_coins',
  'not_giftable',
  'own_pet',
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ApiErrorBody {
  statusCode: number;
  /** A French sentence for API clients and logs; the web app translates from `code`. */
  message: string | string[];
  code?: ApiErrorCode | GameErrorCode;
}
