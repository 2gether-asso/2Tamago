/**
 * API contracts shared by the API (request validation) and the web app (typed
 * client). Request bodies are Zod schemas; responses are plain types.
 */
import { z } from 'zod';
import { DECOR_IDS, ITEM_IDS, type DecorId, type ItemId } from '../engine/catalog.js';
import { ROOM_LIMITS, type Room } from '../engine/room.js';
import type { QuestId, WalkEventId, WalkEventKind } from '../engine/rpg.js';
import { WALK_ZONE_IDS, type WalkZoneId } from '../engine/zones.js';
import { TRADE_LIMITS, tradeProblem } from '../engine/trade.js';
import { CONTEST_KINDS, type ContestKind, type ContestProblem } from '../engine/contests.js';
import { EVENT_KINDS, EVENT_LIMITS, maxPercent, type EventKind } from '../engine/events.js';
import { WORK } from '../engine/work.js';
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
const decorId = z.enum(DECOR_IDS as [DecorId, ...DecorId[]]);
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
    freeMealSatiety: z.number().min(0).max(100),
    fullSatiety: z.number().min(0).max(100),
    overfeedWeight: nonNegative,
    dietWindow: z.number().int().min(1).max(20),
    balancedRegenFactor: nonNegative,
    freeMedicineDose: nonNegative,
    wrongMedicineDose: nonNegative,
    mistakeGraceHours: nonNegative,
    tantrumIntervalHours: positive,
    tantrumWindowHours: nonNegative,
    outingHours: nonNegative,
    vacationMaxHours: positive,
    vacationCooldownHours: nonNegative,
    caressCooldownSeconds: nonNegative,
    playMaxCharges: nonNegative,
    playRefillSeconds: nonNegative,
    praiseCooldownSeconds: nonNegative,
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

/** `POST /auth/token`: trades the code from the sign-in redirect for tokens (PKCE verifier). */
export const tokenBody = z.object({
  code: z.string().min(16).max(128),
  code_verifier: z.string().min(43).max(128),
});
export type TokenBody = z.infer<typeof tokenBody>;

/** `POST /auth/refresh`: the refresh token comes with a DPoP proof in the `DPoP` header. */
export const refreshBody = z.object({
  refresh_token: z.string().min(16).max(256),
});
export type RefreshBody = z.infer<typeof refreshBody>;

export interface TokenResponse {
  access_token: string;
  /** Absent when the refresh duplicated one just done: keep the refresh token you have. */
  refresh_token?: string;
  /** Lifetime of the access token, in seconds. */
  expires_in: number;
}

/** Why the API refused a sign-in or a refresh (the `code` of a 401). */
export const AUTH_ERROR_CODES = [
  'invalid_grant',
  'invalid_dpop',
  'session_expired',
  'session_suspicious',
  'session_roaming',
] as const;
export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

export const FEEDBACK_TYPES = ['bug', 'idea', 'other'] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export const feedbackBody = z.object({
  type: z.enum(FEEDBACK_TYPES),
  message: z.string().trim().min(10).max(2000),
  /** Route the player was on, to help reproduce. */
  page: z.string().max(200).optional(),
});
export type FeedbackBody = z.infer<typeof feedbackBody>;

/** One sign-in of the player, as the account page lists it. */
export interface AccountSession {
  id: string;
  /** The session this very request comes from. */
  current: boolean;
  createdAt: number;
  lastUsedAt: number;
  /** When it ends if nothing renews it (the idle delay or the absolute limit, whichever is first). */
  expiresAt: number;
  /** The IP of the last renewal. */
  ip: string;
  /** Browser and system, as `chrome/windows` (the web app writes the text). */
  family: string;
}

/** `GET /account`: what the player manages about themself. */
export interface AccountOverview {
  displayName: string;
  /** An admin set the name: the player cannot change it. */
  nameLocked: boolean;
  memberSince: number;
  sessions: AccountSession[];
}

/** `PUT /account/name`: same rules as when an admin renames (see `renameBody`). */
export const accountNameBody = z.object({ name: z.string().trim().min(2).max(32) });
export type AccountNameBody = z.infer<typeof accountNameBody>;

/** `DELETE /account`: the player types their displayed name to confirm. */
export const accountDeleteBody = z.object({ confirm: z.string().trim().min(1).max(64) });
export type AccountDeleteBody = z.infer<typeof accountDeleteBody>;

export type DevLoginBody = z.infer<typeof devLoginBody>;

export const adoptBody = z.object({
  name: petName,
  species: z.enum(SPECIES),
  color: z.number().int().min(0).max(359),
});
export type AdoptBody = z.infer<typeof adoptBody>;

export const ownerActionBody = z.discriminatedUnion('type', [
  /** Without an item: the free (small) ration. With one: a meal from the bag. */
  z.object({ type: z.literal('feed'), item: itemId.optional() }),
  z.object({ type: z.literal('treat'), item: itemId }),
  z.object({ type: z.literal('play'), score: z.number().int().min(0).max(3) }),
  z.object({ type: z.literal('clean') }),
  /** Without an item: the free (weak) care. With one: a medicine from the bag. */
  z.object({ type: z.literal('medicine'), item: itemId.optional() }),
  z.object({ type: z.literal('sleep') }),
  z.object({ type: z.literal('wake') }),
  z.object({ type: z.literal('lights'), on: z.boolean() }),
  z.object({ type: z.literal('praise') }),
  z.object({ type: z.literal('scold') }),
  z.object({ type: z.literal('caress') }),
  z.object({ type: z.literal('train'), trick: z.enum(TRICKS) }),
  z.object({ type: z.literal('equip'), item: itemId.nullable() }),
  z.object({ type: z.literal('retire') }),
  z.object({ type: z.literal('startVacation') }),
  z.object({ type: z.literal('endVacation') }),
]);
export type OwnerActionBody = z.infer<typeof ownerActionBody>;

/** What a caretaker may do (see `CARETAKER_ACTION_TYPES`): the same shapes as the owner's. */
export const careActionBody = z.discriminatedUnion('type', [
  z.object({ type: z.literal('feed') }),
  z.object({ type: z.literal('clean') }),
  z.object({ type: z.literal('medicine') }),
  z.object({ type: z.literal('sleep') }),
  z.object({ type: z.literal('wake') }),
  z.object({ type: z.literal('lights'), on: z.boolean() }),
  z.object({ type: z.literal('praise') }),
  z.object({ type: z.literal('scold') }),
  z.object({ type: z.literal('caress') }),
]);
export type CareActionBody = z.infer<typeof careActionBody>;

const tradeBundle = z.partialRecord(itemId, z.number().int().min(1).max(TRADE_LIMITS.maxQuantity));

/** An offer to swap items with another member: what is given, and what is asked in return. */
export const tradeBody = z
  .object({
    targetId: z.uuid(),
    offer: tradeBundle,
    request: tradeBundle,
    /** Coins given, and coins asked: one side at most. */
    offerCoins: z.number().int().min(0).max(TRADE_LIMITS.maxCoins).default(0),
    requestCoins: z.number().int().min(0).max(TRADE_LIMITS.maxCoins).default(0),
  })
  .superRefine((trade, ctx) => {
    const problem = tradeProblem(trade.offer, trade.request, trade.offerCoins, trade.requestCoins);
    if (problem) ctx.addIssue({ code: 'custom', message: problem, path: ['offer'] });
  });
export type TradeBody = z.infer<typeof tradeBody>;

/** `PUT /wishlist`: the items the viewer would like to get (replaces the list). */
export const wishlistBody = z.object({
  items: z.array(itemId).max(TRADE_LIMITS.maxWishlist),
});
export type WishlistBody = z.infer<typeof wishlistBody>;

/** `POST /wishlist/ask`: asks a member for an item of the viewer's wishlist. */
export const wishAskBody = z.object({ targetId: z.uuid(), item: itemId });
export type WishAskBody = z.infer<typeof wishAskBody>;

const rewardItems = z.partialRecord(itemId, z.number().int().min(1).max(20));

/** A gift code an admin creates: what it gives, how often it can be used, until when. */
export const giftCodeBody = z
  .object({
    /** Letters, digits and dashes; stored in capitals, so that players need not care about case. */
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{4,24}$/),
    coins: z.number().int().min(0).max(1000).default(0),
    items: rewardItems.default({}),
    /** How many members can use it, in all. */
    maxUses: z.number().int().min(1).max(10_000),
    /** Epoch ms; `null`: no end. */
    expiresAt: z.number().int().nullable().default(null),
  })
  .refine((gift) => gift.coins > 0 || Object.keys(gift.items).length > 0, {
    message: 'empty_gift',
  })
  .refine((gift) => Object.keys(gift.items).length <= 4, { message: 'too_many_items' });
export type GiftCodeBody = z.infer<typeof giftCodeBody>;

export const redeemBody = z.object({ code: z.string().trim().min(1).max(40) });
export type RedeemBody = z.infer<typeof redeemBody>;

export interface GiftCodeDto {
  id: string;
  code: string;
  coins: number;
  items: Partial<Record<ItemId, number>>;
  maxUses: number;
  uses: number;
  expiresAt: number | null;
  /** Switched off by an admin. */
  disabled: boolean;
  createdAt: number;
}

export interface RedeemResponse {
  /** What the code gave. */
  coins: number;
  items: Partial<Record<ItemId, number>>;
  /** The balance and the bag, after. */
  balance: number;
  inventory: Inventory;
}

/** An admin sets a name (of a companion, or of a member). */
export const renameBody = z.object({ name: z.string().trim().min(2).max(32) });
export type RenameBody = z.infer<typeof renameBody>;

/** Words that cannot be in a companion's name (see `blockedTerm`). */
export const blockedWordsBody = z.object({
  words: z.array(z.string().trim().min(2).max(32)).max(200),
});
export type BlockedWordsBody = z.infer<typeof blockedWordsBody>;

/** A member found by the admin search, with their living companion. */
export interface ModerationPerson {
  playerId: string;
  playerName: string;
  /** An admin set the name: signing in with Discord no longer changes it. */
  nameLocked: boolean;
  petId: string | null;
  petName: string | null;
}

export type ModerationAction =
  'rename_pet' | 'rename_player' | 'unlock_player_name' | 'blocked_words';

export interface ModerationLogEntry {
  id: string;
  adminName: string;
  action: ModerationAction;
  /** Whom it was about (the member), when it was about someone. */
  targetName: string | null;
  before: string | null;
  after: string | null;
  createdAt: number;
}

/** An admin schedules an event: a bonus for a few days. */
export const eventBody = z
  .object({
    kind: z.enum(EVENT_KINDS),
    percent: z.number().int().min(1),
    /** Epoch ms. */
    startsAt: z.number().int(),
    endsAt: z.number().int(),
  })
  .superRefine((event, ctx) => {
    const issue = (message: string, path: string) =>
      ctx.addIssue({ code: 'custom', message, path: [path] });
    if (event.endsAt <= event.startsAt) issue('ends_before_start', 'endsAt');
    else if (event.endsAt - event.startsAt > EVENT_LIMITS.maxDays * 86_400_000) {
      issue('too_long', 'endsAt');
    }
    if (event.percent > maxPercent(event.kind)) issue('too_much', 'percent');
  });
export type EventBody = z.infer<typeof eventBody>;

export interface GameEventDto {
  id: string;
  kind: EventKind;
  percent: number;
  startsAt: number;
  endsAt: number;
  /** Called off by an admin. */
  cancelled: boolean;
}

/** What members see: the bonuses on now, and the ones announced for the days to come. */
export interface EventsOverview {
  active: GameEventDto[];
  upcoming: GameEventDto[];
}

export const contestKind = z.enum(CONTEST_KINDS);
export const contestBody = z.object({ kind: contestKind });
export type ContestBody = z.infer<typeof contestBody>;

/** A member votes for a companion in the week's beauty contest. */
export const voteBody = z.object({ playerId: z.uuid() });
export type VoteBody = z.infer<typeof voteBody>;

export interface ContestEntryDto {
  /** 1 for the best. */
  rank: number;
  playerId: string;
  playerName: string;
  petId: string;
  petName: string;
  species: Species;
  stage: Stage;
  form: Form | null;
  color: number;
  traits: PetTraits | null;
  equipped: string | null;
  mood: Mood;
  /** What the pet had learned when it entered (`tricks`), or the votes it got (`beauty`). */
  score: number;
  isMine: boolean;
  /** Beauty: the viewer's vote this week is for this entry. */
  votedByMe: boolean;
}

export interface ContestBoard {
  kind: ContestKind;
  /** The best entries, best first. */
  entries: ContestEntryDto[];
  /** The viewer's own entry, wherever it ranks. */
  mine: ContestEntryDto | null;
  /** Why the viewer's companion cannot enter right now (`null`: it can, or has). */
  problem: ContestProblem | null;
}

export interface ContestResults {
  kind: ContestKind;
  /** The first three. */
  podium: ContestEntryDto[];
  mine: ContestEntryDto | null;
  /** Coins the viewer can take for their rank (0: none). */
  prize: number;
  claimed: boolean;
}

export interface ContestsOverview {
  /** Monday of the week (YYYY-MM-DD). */
  week: string;
  /** When the week ends and the contests start again (epoch ms). */
  endsAt: number;
  tricks: ContestBoard;
  beauty: ContestBoard;
  /** Last week's results, when anyone took part. */
  last: { week: string; results: ContestResults[] } | null;
}

export interface ContestClaimResponse {
  prize: number;
  coins: number;
}

/** The score of the player's skill game (the server pays it, once per hour). */
export const workBody = z.object({ score: z.number().int().min(0).max(WORK.rounds) });
export type WorkBody = z.infer<typeof workBody>;

/** When each job can be done again (epoch ms; 0 or in the past: now). */
export interface WorkStatus {
  playerAvailableAt: number;
  petAvailableAt: number;
  /** What the companion would earn at best and at worst, from its ability today. */
  petWageRange: { min: number; max: number };
}

export interface WorkResponse {
  /** Coins earned by this job. */
  earned: number;
  coins: number;
  status: WorkStatus;
}

export interface PetWorkResponse extends WorkResponse {
  pet: PetDto;
  events: PetEvent[];
}

/** Entrusting one's companion to another member. */
export const daycareBody = z.object({ caretakerId: z.uuid() });
export type DaycareBody = z.infer<typeof daycareBody>;

/** Where to walk; without a body, the meadow. */
export const walkBody = z
  .object({ zone: z.enum(WALK_ZONE_IDS).default('meadow') })
  .default({ zone: 'meadow' });
export type WalkBody = z.infer<typeof walkBody>;

export const buyBody = z.object({
  item: itemId,
  quantity: z.number().int().min(1).max(20).default(1),
});
export type BuyBody = z.infer<typeof buyBody>;

/** `PUT /room`: the whole room at once (see `roomProblem` for what is allowed). */
export const roomBody = z.object({
  wall: decorId.nullable(),
  floor: decorId.nullable(),
  props: z.array(decorId).max(ROOM_LIMITS.maxProps),
});
export type RoomBody = z.infer<typeof roomBody>;

export const giftBody = z.object({ item: itemId });
export type GiftBody = z.infer<typeof giftBody>;

/** Languages of the push notifications: the service worker writes the text, in the player's. */
export const PUSH_LOCALES = ['fr', 'en'] as const;
export type PushLocale = (typeof PUSH_LOCALES)[number];

/** A browser's push subscription (`PushSubscription.toJSON()`), with the language to write in. */
export const pushSubscriptionBody = z.object({
  endpoint: z.url().max(2048),
  keys: z.object({ p256dh: z.string().min(1).max(256), auth: z.string().min(1).max(256) }),
  locale: z.enum(PUSH_LOCALES),
});
export type PushSubscriptionBody = z.infer<typeof pushSubscriptionBody>;

export const pushUnsubscribeBody = z.object({ endpoint: z.url().max(2048) });
export type PushUnsubscribeBody = z.infer<typeof pushUnsubscribeBody>;

/** Why a push is sent. The API sends the code, the service worker writes the sentence. */
export const PUSH_KINDS = [
  'hungry',
  'sick',
  'calling',
  'walk_done',
  'daycare_invite',
  'trade_offer',
  'test',
] as const;
export type PushKind = (typeof PUSH_KINDS)[number];

/** The data of a push message, as the service worker receives it. */
export interface PushPayload {
  kind: PushKind;
  petName: string;
  /** The other player, for what another player did (the owner who entrusts their companion). */
  playerName?: string;
  locale: PushLocale;
}

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
  /** VAPID public key for Web Push, `null` when notifications are off on this server. */
  pushPublicKey: string | null;
}

export interface MeResponse {
  player: PlayerDto;
  pet: PetDto | null;
  inventory: Inventory;
  /** The player's room, as it shows now. */
  room: Room;
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

/** What happened during a walk (a `walk_event` of the engine); the web app writes the story. */
export interface WalkEventDto {
  walk: WalkEventId;
  kind: WalkEventKind;
  /** Coins and item of the event, already included in `found`. */
  coins?: number;
  item?: ItemId;
  quest?: QuestId;
  step?: number;
  questDone?: boolean;
}

export interface WalkResponse extends ActionResponse {
  zone: WalkZoneId;
  /** What happened on the way. */
  walkEvent: WalkEventDto;
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
    /** Whether the viewer follows this player. */
    favorite: boolean;
  };
  stats: PlayerStats;
  /** Their living companion, brought up to date. */
  pet: PetDto | null;
  room: Room;
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
  ownerId: string;
  ownerName: string;
  caressedToday: boolean;
  /** Whether the viewer follows the owner (favorites come first in the village). */
  favorite: boolean;
}

export interface FavoriteResponse {
  favorite: boolean;
}

/** The village's goal of the week: walks done together, and a reward for those who took part. */
export interface CommunityGoal {
  /** Monday of the week (YYYY-MM-DD). */
  week: string;
  /** When the week ends and the goal resets (epoch ms). */
  endsAt: number;
  target: number;
  /** Walks the whole village completed this week. */
  progress: number;
  /** Walks the viewer completed this week. */
  mine: number;
  reached: boolean;
  /** Coins for each player who took part, once the goal is reached. */
  reward: number;
  claimed: boolean;
  /** Reached, taken part and not yet claimed. */
  canClaim: boolean;
}

export interface ClaimResponse {
  coins: number;
  reward: number;
}

export interface VisitResponse {
  pet: PetDto;
  caressedToday: boolean;
  /** Set when the viewer looks after this companion right now: the way to the care actions. */
  daycareId: string | null;
  /** The owner's room. */
  room: Room;
}

/** `pending`: waiting for the caretaker's answer. `active`: the caretaker looks after the pet. */
export type DaycareStatus = 'pending' | 'active';

export interface DaycareDto {
  id: string;
  status: DaycareStatus;
  petId: string;
  petName: string;
  ownerId: string;
  ownerName: string;
  caretakerId: string;
  caretakerName: string;
  /** When the invitation lapses (pending) or the stay ends by itself (active), epoch ms. */
  expiresAt: number;
}

/** What is swapped, as the API sends it: item id to quantity. */
export type TradeItems = Partial<Record<ItemId, number>>;

export interface TradeDto {
  id: string;
  proposerId: string;
  proposerName: string;
  targetId: string;
  targetName: string;
  /** What the proposer gives (already set aside for the trade). */
  offer: TradeItems;
  /** What the proposer asks the target for. */
  request: TradeItems;
  /** Coins the proposer gives (already set aside), and coins they ask for. */
  offerCoins: number;
  requestCoins: number;
  /** The offer lapses at this time (epoch ms), and the proposer gets their items back. */
  expiresAt: number;
}

export interface TradeOverview {
  /** How long an offer waits for an answer, in hours. */
  expireHours: number;
  /** Offers one player can have waiting at once. */
  maxOpen: number;
  /** Offers waiting for the viewer's answer. */
  incoming: TradeDto[];
  /** The viewer's own offers, waiting for an answer. */
  outgoing: TradeDto[];
}

/** What a member can be asked for, and what they would like to get. */
export interface TradeTarget {
  /** Their bag: only these items can be requested from them. */
  inventory: Inventory;
  wishlist: ItemId[];
}

export interface WishlistDto {
  items: ItemId[];
  max: number;
}

export interface TradeResult {
  coins: number;
  inventory: Inventory;
}

export interface DaycareOverview {
  /** How long a stay lasts at most, in days (it ends by itself after that). */
  maxDays: number;
  /** The viewer's own companion, entrusted to someone (or an invitation waiting for an answer). */
  entrusted: DaycareDto | null;
  /** Companions the viewer looks after. */
  caring: DaycareDto[];
  /** Invitations the viewer can accept or decline. */
  invitations: DaycareDto[];
}

export type ActivityKind =
  | 'pet_event'
  | 'visit_caress'
  | 'visit_gift'
  | 'encounter'
  | 'daily_bonus'
  | 'community_reward'
  | 'daycare_invite'
  | 'daycare_accepted'
  | 'daycare_declined'
  | 'daycare_ended'
  | 'daycare_care'
  | 'trade_offer'
  | 'trade_accepted'
  | 'trade_declined'
  | 'trade_expired'
  | 'wish_request'
  | 'name_changed';

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
  'already_claimed',
  'already_has_pet',
  'code_already_redeemed',
  'code_exists',
  'code_expired',
  'code_used_up',
  'daycare_exists',
  'daycare_full',
  'feedback_disabled',
  'goal_not_reached',
  'missing_item',
  'room_invalid',
  'room_not_owned',
  'name_locked',
  'confirmation_mismatch',
  'name_not_allowed',
  'no_session',
  'no_code',
  'no_contribution',
  'no_entry',
  'no_prize',
  'no_event',
  'no_daycare',
  'no_trade',
  'no_pet',
  'no_player',
  'not_enough_coins',
  'not_for_sale',
  'trade_full',
  'work_cooldown',
  'trade_invalid',
  'wish_already_asked',
  'not_giftable',
  'own_pet',
  'own_profile',
  'push_disabled',
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ApiErrorBody {
  statusCode: number;
  /** A French sentence for API clients and logs; the web app translates from `code`. */
  message: string | string[];
  code?: ApiErrorCode | GameErrorCode;
}
