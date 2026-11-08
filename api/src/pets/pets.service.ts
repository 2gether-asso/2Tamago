import { randomInt } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import {
  applyAction,
  createPet,
  simulate,
  traitsOf,
  type GameRules,
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
import { and, desc, eq, ne, type SQL } from 'drizzle-orm';
import { AnnouncementService } from '../announcements/announcement.service.js';
import { ActivityService } from '../activity/activity.service.js';
import { Clock } from '../common/clock.js';
import { GameRulesService } from '../game/game-rules.service.js';
import type { Database, Transaction } from '../database/database.js';
import { pets, players, type PetRow } from '../database/schema.js';
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
      serverTime: this.now(),
    };
  }

  async adopt(playerId: string, body: AdoptBody) {
    const now = this.now();
    const state = createPet({ ...body, seed: randomInt(2 ** 32), now }, this.rules);
    const inserted = await this.db
      .insert(pets)
      .values({ ownerId: playerId, status: state.status, state })
      .onConflictDoNothing()
      .returning();
    if (inserted.length === 0) {
      throw new ConflictException({
        statusCode: 409,
        message: 'Tu as déjà un compagnon.',
        code: 'already_has_pet',
      });
    }
    const player = await this.players.get(this.db, playerId);
    return toPetDto(inserted[0]!, player.displayName);
  }

  async act(playerId: string, action: OwnerActionBody): Promise<ActionResponse> {
    const notices: Notice[] = [];
    const result = await this.mutate(eq(pets.ownerId, playerId), async (state, now, tx) => {
      const change = applyAction(state, action, now, this.rules);
      if (action.type === 'treat') {
        if (!(await this.players.takeItem(tx, playerId, action.item))) throw missingItem();
      }
      if (action.type === 'equip' && action.item !== null) {
        if (!(await this.players.hasItem(tx, playerId, action.item))) throw missingItem();
      }
      const reward = action.type === 'play' ? 2 : action.type === 'train' ? 1 : 0;
      if (reward > 0) {
        const earned = await this.players.earnCappedReward(tx, playerId, reward);
        if (earned > 0) notices.push({ code: 'coins_earned', count: earned });
      }
      return change;
    });
    return {
      pet: toPetDto(result.row, result.ownerName),
      events: result.events,
      coins: await this.players.coinsOf(playerId),
      notices,
    };
  }

  async album(playerId: string): Promise<AlbumEntry[]> {
    const rows = await this.db
      .select()
      .from(pets)
      .where(and(eq(pets.ownerId, playerId), ne(pets.status, 'alive')))
      .orderBy(desc(pets.createdAt));
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
    }));
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
          message: 'Aucun compagnon.',
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

function missingItem() {
  return new ConflictException({
    statusCode: 409,
    message: 'Tu n’as pas cet objet.',
    code: 'missing_item',
  });
}
