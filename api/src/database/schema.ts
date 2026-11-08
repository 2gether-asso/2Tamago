import type { WalkZoneId } from '@2tamago/core';
import type { ActivityKind, PushKind, PushLocale } from '@2tamago/core/contracts';
import type { PetState } from '@2tamago/core';
import { sql } from 'drizzle-orm';
import {
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
  avatarUrl: text('avatar_url'),
  coins: integer().notNull().default(50),
  lastDailyBonusDay: text('last_daily_bonus_day'),
  /** Coins earned today by playing and training, capped per day. */
  rewardDay: text('reward_day'),
  rewardCoins: integer('reward_coins').notNull().default(0),
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
