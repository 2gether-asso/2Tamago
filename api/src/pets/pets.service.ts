import { randomInt } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import {
  applyAction,
  createPet,
  heirloomOf,
  simulate,
  traitsOf,
  WISH,
  type GameRules,
  type MissionSignal,
  type PetEvent,
  type PetState,
} from '@2tamago/core';
import type {
  ActionResponse,
  AdoptBody,
  AlbumEntry,
  MeResponse,
  Notice,
  OwnerActionBody,
} from '@2tamago/core/contracts';
import { and, desc, eq, type SQL } from 'drizzle-orm';
import { AnnouncementService } from '../announcements/announcement.service.js';
import { ActivityService } from '../activity/activity.service.js';
import { Clock } from '../common/clock.js';
import { GameRulesService } from '../game/game-rules.service.js';
import type { Database, Transaction } from '../database/database.js';
import { petFlowers, pets, players, type PetRow } from '../database/schema.js';
import { MissionsService } from '../missions/missions.service.js';
import { NameFilterService } from '../moderation/name-filter.service.js';
import { PlayersService } from '../players/players.service.js';
import { notableEvents, toPetDto } from './pet-mapper.js';

export interface PetChange<T = undefined> {
  state: PetState;
  events: PetEvent[];
  extra?: T;
}

export interface MutationResult<T> {
  row: PetRow;
  ownerName: string;
  events: PetEvent[];
  extra: T | undefined;
}

/**
 * Persistence of pets around the pure engine. Every change goes through
 * `mutate()`: lock the row, run the engine, save, log notable events, all in
 * one transaction. Row locks (rather than a global lock) keep players from
 * stepping on each other while letting different pets change in parallel.
 */
@Injectable()
export class PetsService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly gameRules: GameRulesService,
    private readonly clock: Clock,
    private readonly players: PlayersService,
    private readonly activity: ActivityService,
    private readonly announcements: AnnouncementService,
    private readonly nameFilter: NameFilterService,
    private readonly missions: MissionsService,
  ) {}

  private get rules(): GameRules {
    return this.gameRules.current;
  }

  now(): number {
    return this.clock.now();
  }

  async me(playerId: string, isAdmin: boolean): Promise<MeResponse> {
    await this.players.claimDailyBonus(playerId);
    const pet = await this.sync(eq(pets.ownerId, playerId));
    const player = await this.players.get(this.db, playerId);
    return {
      player: this.players.toDto(player, isAdmin),
      pet: pet ? toPetDto(pet.row, pet.ownerName) : null,
      inventory: await this.players.inventory(this.db, playerId),
      room: await this.players.room(this.db, playerId),
      heirloom: player.heirloom,
      serverTime: this.now(),
    };
  }

  async adopt(playerId: string, body: AdoptBody) {
    await this.nameFilter.assertAllowed(body.name);
    const now = this.now();
    return this.db.transaction(async (tx) => {
      const player = await this.players.get(tx, playerId);
      // What the last retired companion handed down goes to this egg, once.
      const state = createPet(
        { ...body, seed: randomInt(2 ** 32), heirloom: player.heirloom, now },
        this.rules,
      );
      const inserted = await tx
        .insert(pets)
        .values({ ownerId: playerId, status: state.status, state })
        .onConflictDoNothing()
        .returning();
      if (inserted.length === 0) {
        throw new ConflictException({
          statusCode: 409,
          code: 'already_has_pet',
        });
      }
      if (player.heirloom) await this.players.setHeirloom(tx, playerId, null);
      return toPetDto(inserted[0]!, player.displayName);
    });
  }

  async act(playerId: string, action: OwnerActionBody): Promise<ActionResponse> {
    const notices: Notice[] = [];
    const result = await this.mutate(eq(pets.ownerId, playerId), async (state, now, tx) => {
      const change = applyAction(state, action, now, this.rules);
      // A retirement leaves an egg for the next companion.
      if (action.type === 'retire') {
        const heirloom = heirloomOf(change.state);
        if (heirloom) await this.players.setHeirloom(tx, playerId, heirloom);
      }
      // Treats, meals and medicines come out of the bag; the free care (no item) costs nothing.
      const spent =
        action.type === 'treat' || action.type === 'feed' || action.type === 'medicine'
          ? action.item
          : undefined;
      if (spent !== undefined) {
        if (!(await this.players.takeItem(tx, playerId, spent))) throw missingItem();
      }
      if (action.type === 'equip' && action.item !== null) {
        if (!(await this.players.hasItem(tx, playerId, action.item))) throw missingItem();
      }
      const reward = action.type === 'play' ? 2 : action.type === 'train' ? 1 : 0;
      if (reward > 0) {
        const earned = await this.players.earnCappedReward(tx, playerId, reward);
        if (earned > 0) notices.push({ code: 'coins_earned', count: earned });
      }
      notices.push(...(await this.rewardWishes(tx, playerId, change.events)));
      const signal = missionSignal(action, state, change.state);
      if (signal) notices.push(...(await this.missions.record(tx, playerId, signal)));
      return change;
    });
    return {
      pet: toPetDto(result.row, result.ownerName),
      events: result.events,
      coins: await this.players.coinsOf(playerId),
      notices,
    };
  }

  /** Coins for the wishes the owner just granted (outside the daily cap: wishes are few a day). */
  async rewardWishes(tx: Transaction, playerId: string, events: PetEvent[]): Promise<Notice[]> {
    const granted = events.filter((event) => event.type === 'wish_granted').length;
    if (granted === 0) return [];
    await this.players.addCoins(tx, playerId, granted * WISH.coins);
    return [
      { code: 'coins_earned', count: granted * WISH.coins },
      ...(await this.missions.record(tx, playerId, 'wish', granted)),
    ];
  }

  async album(playerId: string): Promise<AlbumEntry[]> {
    const rows = await this.db
      .select()
      .from(pets)
      .where(eq(pets.ownerId, playerId))
      .orderBy(desc(pets.createdAt));
    const today = this.players.today();
    const flowerRows = await this.db
      .select({ petId: petFlowers.petId, day: petFlowers.day })
      .from(petFlowers)
      .innerJoin(pets, eq(pets.id, petFlowers.petId))
      .where(eq(pets.ownerId, playerId));
    const flowers = new Map<string, { count: number; today: boolean }>();
    for (const { petId, day } of flowerRows) {
      const entry = flowers.get(petId) ?? { count: 0, today: false };
      entry.count += 1;
      entry.today ||= day === today;
      flowers.set(petId, entry);
    }
    return rows.map(({ id, state }) => ({
      petId: id,
      name: state.name,
      species: state.species,
      stage: state.stage,
      form: state.form,
      color: state.color,
      traits: traitsOf(state),
      status: state.status as AlbumEntry['status'],
      bornAt: state.bornAt,
      endedAt: state.endedAt,
      flowers: flowers.get(id)?.count ?? 0,
      flowerToday: flowers.get(id)?.today ?? false,
    }));
  }

  /** Lays a flower for one of the player's companions who is gone, once a day. */
  async layFlower(playerId: string, petId: string): Promise<void> {
    const [row] = await this.db
      .select({ status: pets.status })
      .from(pets)
      .where(and(eq(pets.id, petId), eq(pets.ownerId, playerId)));
    if (!row || row.status !== 'gone') {
      throw new NotFoundException({ statusCode: 404, code: 'no_pet' });
    }
    const inserted = await this.db
      .insert(petFlowers)
      .values({ petId, day: this.players.today() })
      .onConflictDoNothing()
      .returning();
    if (inserted.length === 0) {
      throw new ConflictException({
        statusCode: 409,
        message: 'Tu as déjà déposé une fleur aujourd’hui.',
        code: 'already_flowered',
      });
    }
  }

  /**
   * Brings the latest pet matching `where` up to date. Only writes when
   * something happened (an event), so plain reads stay cheap.
   */
  async sync(where: SQL): Promise<{ row: PetRow; ownerName: string } | null> {
    const latest = await this.findLatest(this.db, where);
    if (!latest) return null;
    const preview = simulate(latest.row.state, this.now(), this.rules);
    if (preview.events.length === 0) return latest;
    return this.mutate(eq(pets.id, latest.row.id), (state, now) =>
      simulate(state, now, this.rules),
    );
  }

  /** Locks the latest pet matching `where`, applies `change`, saves it. */
  async mutate<T = undefined>(
    where: SQL,
    change: (
      state: PetState,
      now: number,
      tx: Transaction,
      row: PetRow,
    ) => PetChange<T> | Promise<PetChange<T>>,
  ): Promise<MutationResult<T>> {
    const result = await this.db.transaction(async (tx) => {
      const found = await this.findLatest(tx, where, true);
      if (!found) {
        throw new NotFoundException({
          statusCode: 404,
          code: 'no_pet',
        });
      }
      const now = this.now();
      const { state, events, extra } = await change(found.row.state, now, tx, found.row);
      const [row] = await tx
        .update(pets)
        .set({ state, status: state.status, updatedAt: new Date(now) })
        .where(eq(pets.id, found.row.id))
        .returning();
      for (const event of notableEvents(events)) {
        await this.activity.record(tx, found.row.ownerId, 'pet_event', {
          ...event.data,
          event: event.type,
          petName: state.name,
          at: event.at,
        });
      }
      return { row: row!, ownerName: found.ownerName, events, extra };
    });
    // Once the change is saved for good, not before: a rolled back hatching is not news.
    this.announcements.petEvents(
      {
        petName: result.row.state.name,
        ownerName: result.ownerName,
        species: result.row.state.species,
        form: result.row.state.form,
      },
      result.events,
    );
    return result;
  }

  private async findLatest(executor: Database | Transaction, where: SQL, lock = false) {
    const query = executor
      .select({ row: pets, ownerName: players.displayName })
      .from(pets)
      .innerJoin(players, eq(players.id, pets.ownerId))
      .where(where)
      .orderBy(desc(pets.createdAt))
      .limit(1);
    const [found] = lock ? await query.for('update', { of: pets }) : await query;
    return found ?? null;
  }
}

/** What an owner action counts for in the daily missions (a caress on cooldown counts for nothing). */
function missionSignal(
  action: OwnerActionBody,
  before: PetState,
  after: PetState,
): MissionSignal | null {
  switch (action.type) {
    case 'play':
      return 'play';
    case 'train':
      return 'train';
    case 'treat':
      return 'treat';
    case 'feed':
      return action.item ? 'meal' : null;
    case 'caress':
      return after.lastCaressAt !== before.lastCaressAt ? 'caress' : null;
    default:
      return null;
  }
}

function missingItem() {
  return new ConflictException({
    statusCode: 409,
    code: 'missing_item',
  });
}
