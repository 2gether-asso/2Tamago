import type { ContestKind, EventKind, ItemId, WalkZoneId } from '@2tamago/core';
import type {
  ActivityKind,
  ModerationAction,
  PushKind,
  PushLocale,
  TradeItems,
} from '@2tamago/core/contracts';
import type { PetState } from '@2tamago/core';
import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const players = pgTable('players', {
  id: uuid().primaryKey().defaultRandom(),
  /** Discord user id, or `dev:<name>` for development accounts. */
  discordId: text('discord_id').notNull().unique(),
  displayName: text('display_name').notNull(),
  /** An admin set the name: the Discord name no longer replaces it at sign-in. */
  nameLocked: boolean('name_locked').notNull().default(false),
  avatarUrl: text('avatar_url'),
  coins: integer().notNull().default(50),
  lastDailyBonusDay: text('last_daily_bonus_day'),
  /** Coins earned today by playing and training, capped per day. */
  rewardDay: text('reward_day'),
  rewardCoins: integer('reward_coins').notNull().default(0),
  /** Last job of the player, and of their companion (one per cooldown, see `WORK`). */
  lastWorkAt: timestamp('last_work_at', { withTimezone: true }),
  lastPetWorkAt: timestamp('last_pet_work_at', { withTimezone: true }),
  createdAt: createdAt(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
});

export const pets = pgTable(
  'pets',
  {
    id: uuid().primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    /** Copy of `state.status`, for queries. */
    status: text().$type<PetState['status']>().notNull(),
    /** The whole engine state, see `@2tamago/core`. */
    state: jsonb().$type<PetState>().notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One living pet per player at a time.
    uniqueIndex('pets_one_alive_per_owner')
      .on(t.ownerId)
      .where(sql`${t.status} = 'alive'`),
    index('pets_status_updated_idx').on(t.status, t.updatedAt),
  ],
);

export const inventory = pgTable(
  'inventory',
  {
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    itemId: text('item_id').notNull(),
    quantity: integer().notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.itemId] })],
);

/** Caresses and gifts given to other players' pets. */
export const interactions = pgTable(
  'interactions',
  {
    id: uuid().primaryKey().defaultRandom(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    petId: uuid('pet_id')
      .notNull()
      .references(() => pets.id, { onDelete: 'cascade' }),
    kind: text().$type<'caress' | 'gift'>().notNull(),
    day: text().notNull(),
    itemId: text('item_id'),
    createdAt: createdAt(),
  },
  (t) => [
    // One caress per visitor, per pet, per day.
    uniqueIndex('interactions_one_caress_per_day')
      .on(t.actorId, t.petId, t.day)
      .where(sql`${t.kind} = 'caress'`),
    index('interactions_pet_idx').on(t.petId, t.createdAt),
  ],
);

export const walks = pgTable(
  'walks',
  {
    id: uuid().primaryKey().defaultRandom(),
    petId: uuid('pet_id')
      .notNull()
      .references(() => pets.id, { onDelete: 'cascade' }),
    zone: text().$type<WalkZoneId>().notNull().default('meadow'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    returnedAt: timestamp('returned_at', { withTimezone: true }),
  },
  (t) => [index('walks_time_idx').on(t.startedAt, t.endsAt)],
);

/** Two walks that overlapped: the pets met. `walkA` < `walkB`. */
export const encounters = pgTable(
  'encounters',
  {
    walkA: uuid('walk_a')
      .notNull()
      .references(() => walks.id, { onDelete: 'cascade' }),
    walkB: uuid('walk_b')
      .notNull()
      .references(() => walks.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.walkA, t.walkB] }), index('encounters_walk_b_idx').on(t.walkB)],
);

/** Players a player follows: they come first in the village. */
export const favorites = pgTable(
  'favorites',
  {
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    favoriteId: uuid('favorite_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.favoriteId] })],
);

/** The village's goal of a week, with the target fixed when the week's first visitor asks. */
export const communityGoals = pgTable('community_goals', {
  /** Monday of the week, see `weekOf`. */
  week: text().primaryKey(),
  target: integer().notNull(),
  reachedAt: timestamp('reached_at', { withTimezone: true }),
  createdAt: createdAt(),
});

/** A player collecting their reward for a week's goal (once per week). */
export const communityClaims = pgTable(
  'community_claims',
  {
    week: text()
      .notNull()
      .references(() => communityGoals.week, { onDelete: 'cascade' }),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.week, t.playerId] })],
);

/** A browser that wants notifications for a player (one row per browser, found by its endpoint). */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid().primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    endpoint: text().notNull().unique(),
    p256dh: text().notNull(),
    auth: text().notNull(),
    /** The language the service worker writes the notification in. */
    locale: text().$type<PushLocale>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('push_subscriptions_player_idx').on(t.playerId)],
);

/**
 * Alerts already notified and still going on: a row exists from the push until the alert ends,
 * so a pet that stays hungry is announced once, not at every check.
 */
export const pushAlerts = pgTable(
  'push_alerts',
  {
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    kind: text().$type<PushKind>().notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.kind] })],
);

/**
 * A companion entrusted to another player: invited (`pending`), then looked after (`active`), then
 * `ended`. Ended rows stay (history); at most one open row per pet.
 */
export const daycares = pgTable(
  'daycares',
  {
    id: uuid().primaryKey().defaultRandom(),
    petId: uuid('pet_id')
      .notNull()
      .references(() => pets.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    caretakerId: uuid('caretaker_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    status: text().$type<'pending' | 'active' | 'ended'>().notNull(),
    /** The invitation lapses, or the stay ends by itself, at this time. */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('daycares_one_open_per_pet')
      .on(t.petId)
      .where(sql`${t.status} <> 'ended'`),
    index('daycares_caretaker_idx').on(t.caretakerId, t.status),
    index('daycares_owner_idx').on(t.ownerId, t.status),
  ],
);

/**
 * An offer to swap items. The offered items are taken from the proposer when the offer is made
 * (set aside, so that they cannot be spent meanwhile) and given back unless it is accepted.
 */
export const trades = pgTable(
  'trades',
  {
    id: uuid().primaryKey().defaultRandom(),
    proposerId: uuid('proposer_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    targetId: uuid('target_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    offer: jsonb().$type<TradeItems>().notNull(),
    request: jsonb().$type<TradeItems>().notNull(),
    /** Coins given (set aside while the offer waits) and coins asked for. */
    offerCoins: integer('offer_coins').notNull().default(0),
    requestCoins: integer('request_coins').notNull().default(0),
    status: text().$type<'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired'>().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [
    index('trades_target_idx').on(t.targetId, t.status),
    index('trades_proposer_idx').on(t.proposerId, t.status),
  ],
);

/** The items a player would like to get, shown on their profile. */
export const wishlist = pgTable(
  'wishlist',
  {
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    itemId: text('item_id').$type<ItemId>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.itemId] })],
);

/** "Could you part with this item?": one ask per item and pair of players per day. */
export const wishAsks = pgTable(
  'wish_asks',
  {
    askerId: uuid('asker_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    targetId: uuid('target_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    itemId: text('item_id').$type<ItemId>().notNull(),
    askedAt: timestamp('asked_at', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.askerId, t.targetId, t.itemId] })],
);

/** A code that gives coins and items to whoever enters it (once per player), made by an admin. */
export const giftCodes = pgTable('gift_codes', {
  id: uuid().primaryKey().defaultRandom(),
  /** In capitals. */
  code: text().notNull().unique(),
  coins: integer().notNull().default(0),
  items: jsonb().$type<TradeItems>().notNull(),
  maxUses: integer('max_uses').notNull(),
  uses: integer().notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  disabledAt: timestamp('disabled_at', { withTimezone: true }),
  createdBy: uuid('created_by').references(() => players.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
});

export const giftCodeRedemptions = pgTable(
  'gift_code_redemptions',
  {
    codeId: uuid('code_id')
      .notNull()
      .references(() => giftCodes.id, { onDelete: 'cascade' }),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.codeId, t.playerId] })],
);

/** An event: a bonus on for a while (see `EVENT_KINDS`). */
export const gameEvents = pgTable(
  'game_events',
  {
    id: uuid().primaryKey().defaultRandom(),
    kind: text().$type<EventKind>().notNull(),
    percent: integer().notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => players.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('game_events_time_idx').on(t.startsAt, t.endsAt)],
);

/** A companion in a week's contest (one entry per member, per week and per contest). */
export const contestEntries = pgTable(
  'contest_entries',
  {
    /** Monday of the week, see `weekOf`. */
    week: text().notNull(),
    kind: text().$type<ContestKind>().notNull(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    petId: uuid('pet_id')
      .notNull()
      .references(() => pets.id, { onDelete: 'cascade' }),
    /** The trick score when entering (`tricks`); beauty is scored by votes instead. */
    score: integer().notNull().default(0),
    createdAt: createdAt(),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.week, t.kind, t.playerId] })],
);

/** A member's vote in the week's beauty contest: one a week, for someone else's entry. */
export const contestVotes = pgTable(
  'contest_votes',
  {
    week: text().notNull(),
    voterId: uuid('voter_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.week, t.voterId] }),
    index('contest_votes_candidate_idx').on(t.week, t.candidateId),
  ],
);

/** What admins did to names, for accountability. */
export const moderationLog = pgTable(
  'moderation_log',
  {
    id: uuid().primaryKey().defaultRandom(),
    adminId: uuid('admin_id').references(() => players.id, { onDelete: 'set null' }),
    action: text().$type<ModerationAction>().notNull(),
    targetPlayerId: uuid('target_player_id').references(() => players.id, {
      onDelete: 'set null',
    }),
    before: text(),
    after: text(),
    createdAt: createdAt(),
  },
  (t) => [index('moderation_log_time_idx').on(t.createdAt)],
);

/** What happened to a player: their pet's life events and other players' actions. */
export const activity = pgTable(
  'activity',
  {
    id: uuid().primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    kind: text().$type<ActivityKind>().notNull(),
    data: jsonb().$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
    readAt: timestamp('read_at', { withTimezone: true }),
  },
  (t) => [index('activity_player_idx').on(t.playerId, t.createdAt)],
);

export type PlayerRow = typeof players.$inferSelect;
export type PetRow = typeof pets.$inferSelect;

/** Runtime settings edited from the admin screen (one row per setting, JSON value). */
export const gameSettings = pgTable('game_settings', {
  key: text().primaryKey(),
  value: jsonb().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A sign-in of a browser (or other client), identified by the key it proves it owns on every
 * refresh (DPoP). The refresh token is opaque and rotates; only its hash is stored.
 */
export const authSessions = pgTable(
  'auth_sessions',
  {
    id: uuid().primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    /** SHA-256 thumbprint (RFC 7638) of the client's public key. */
    keyThumbprint: text('key_thumbprint').notNull(),
    refreshHash: text('refresh_hash').notNull().unique(),
    /** The token before the last rotation, still accepted for a few seconds (two tabs racing). */
    previousRefreshHash: text('previous_refresh_hash'),
    rotatedAt: timestamp('rotated_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
    /** Slides with each refresh; the session ends when the player stops playing for this long. */
    idleExpiresAt: timestamp('idle_expires_at', { withTimezone: true }).notNull(),
    absoluteExpiresAt: timestamp('absolute_expires_at', { withTimezone: true }).notNull(),
    /** What the client looked like at sign-in: later refreshes are compared with it. */
    firstIp: text('first_ip').notNull(),
    firstNetwork: text('first_network').notNull(),
    firstUserAgent: text('first_user_agent').notNull(),
    /** Coarse browser and system (no version), so that browser updates do not matter. */
    clientFamily: text('client_family').notNull(),
    lastIp: text('last_ip').notNull(),
    /** Since when the refreshes come from another network than the sign-in's (null: same network). */
    roamingSince: timestamp('roaming_since', { withTimezone: true }),
  },
  (t) => [index('auth_sessions_player_idx').on(t.playerId)],
);

/** One-time codes handed back after Discord, redeemed with the PKCE verifier. */
export const authCodes = pgTable('auth_codes', {
  hash: text().primaryKey(),
  playerId: uuid('player_id')
    .notNull()
    .references(() => players.id, { onDelete: 'cascade' }),
  codeChallenge: text('code_challenge').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

/** Proofs already seen (key thumbprint + jti): a proof works once. */
export const authProofs = pgTable('auth_proofs', {
  id: text().primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export type AuthSessionRow = typeof authSessions.$inferSelect;
