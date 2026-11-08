import type { ActivityKind } from '@2tamago/core/contracts';
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
