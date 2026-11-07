import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import {
  applyAction,
  ITEMS,
  isSnack,
  moodOf,
  simulate,
  type GameRules,
  type ItemId,
} from '@2tamago/core';
import type { ActionResponse, VillagePet, VisitResponse } from '@2tamago/core/contracts';
import { and, desc, eq, ne } from 'drizzle-orm';
import { ActivityService } from '../activity/activity.service.js';
import { Clock } from '../common/clock.js';
import { GAME_RULES } from '../common/tokens.js';
import type { Database, Executor } from '../database/database.js';
import { interactions, pets, players } from '../database/schema.js';
import { toPetDto } from '../pets/pet-mapper.js';
import { PetsService } from '../pets/pets.service.js';
import { PlayersService } from '../players/players.service.js';

export const CARESS_REWARD = 3;
const VILLAGE_SIZE = 60;

/**
 * The village: the other players' pets. Visitors can caress a pet once a day
 * and give it treats; the owner finds it in their activity feed.
 */
@Injectable()
export class VillageService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    @Inject(GAME_RULES) private readonly rules: GameRules,
    private readonly clock: Clock,
    private readonly pets: PetsService,
    private readonly players: PlayersService,
    private readonly activity: ActivityService,
  ) {}

  async list(viewerId: string): Promise<VillagePet[]> {
    const rows = await this.db
      .select({ pet: pets, ownerName: players.displayName })
      .from(pets)
      .innerJoin(players, eq(players.id, pets.ownerId))
      .where(and(eq(pets.status, 'alive'), ne(pets.ownerId, viewerId)))
      .orderBy(desc(pets.updatedAt))
      .limit(VILLAGE_SIZE);
    const caressed = await this.caressedToday(this.db, viewerId);
    const now = this.clock.now();
    return rows.map(({ pet, ownerName }) => {
      // Read-only preview: the owner's own visits persist the simulation.
      const state = simulate(pet.state, now, this.rules).state;
      return {
        petId: pet.id,
        name: state.name,
        species: state.species,
        stage: state.stage,
        form: state.form,
        color: state.color,
        equipped: state.equipped,
        mood: moodOf(state),
        ownerName,
        caressedToday: caressed.has(pet.id),
      };
    });
  }

  async visit(viewerId: string, petId: string): Promise<VisitResponse> {
    const pet = await this.pets.sync(eq(pets.id, petId));
    if (!pet) throw notFound();
    const caressed = await this.caressedToday(this.db, viewerId);
    return { pet: toPetDto(pet.row, pet.ownerName), caressedToday: caressed.has(petId) };
  }

  async caress(viewerId: string, petId: string): Promise<ActionResponse> {
    const visitor = await this.players.get(this.db, viewerId);
    const result = await this.pets.mutate(eq(pets.id, petId), async (state, now, tx, row) => {
      this.assertVisitable(row.ownerId, viewerId, row.status);
      const change = applyAction(state, { type: 'visitorCaress' }, now, this.rules);
      const inserted = await tx
        .insert(interactions)
        .values({ actorId: viewerId, petId, kind: 'caress', day: this.players.today() })
        .onConflictDoNothing()
        .returning();
      if (inserted.length === 0) {
        throw new ConflictException({
          statusCode: 409,
          message: `Tu as déjà caressé ${state.name} aujourd’hui.`,
          code: 'already_caressed',
        });
      }
      await this.players.addCoins(tx, viewerId, CARESS_REWARD);
      await this.activity.record(tx, row.ownerId, 'visit_caress', {
        visitorName: visitor.displayName,
        petName: state.name,
      });
      return change;
    });
    return {
      pet: toPetDto(result.row, result.ownerName),
      events: [],
      coins: await this.players.coinsOf(viewerId),
      notices: [`${result.row.state.name} est tout content !`, `+${CARESS_REWARD} pièces`],
    };
  }

  async gift(viewerId: string, petId: string, item: ItemId): Promise<ActionResponse> {
    if (!isSnack(item)) {
      throw new ConflictException({
        statusCode: 409,
        message: 'Seules les friandises peuvent être offertes.',
        code: 'not_giftable',
      });
    }
    const visitor = await this.players.get(this.db, viewerId);
    const result = await this.pets.mutate(eq(pets.id, petId), async (state, now, tx, row) => {
      this.assertVisitable(row.ownerId, viewerId, row.status);
      const change = applyAction(state, { type: 'visitorTreat', item }, now, this.rules);
      if (!(await this.players.takeItem(tx, viewerId, item))) {
        throw new ConflictException({
          statusCode: 409,
          message: 'Tu n’as pas cet objet.',
          code: 'missing_item',
        });
      }
      await tx.insert(interactions).values({
        actorId: viewerId,
        petId,
        kind: 'gift',
        day: this.players.today(),
        itemId: item,
      });
      await this.activity.record(tx, row.ownerId, 'visit_gift', {
        visitorName: visitor.displayName,
        petName: state.name,
        item,
      });
      return change;
    });
    return {
      pet: toPetDto(result.row, result.ownerName),
      events: [],
      coins: await this.players.coinsOf(viewerId),
      notices: [`${ITEMS[item].label} offert à ${result.row.state.name} !`],
    };
  }

  private assertVisitable(ownerId: string, viewerId: string, status: string): void {
    if (ownerId === viewerId) {
      throw new ForbiddenException({
        statusCode: 403,
        message: 'C’est ton propre compagnon !',
        code: 'own_pet',
      });
    }
    if (status !== 'alive') throw notFound();
  }

  private async caressedToday(executor: Executor, viewerId: string): Promise<Set<string>> {
    const rows = await executor
      .select({ petId: interactions.petId })
      .from(interactions)
      .where(
        and(
          eq(interactions.actorId, viewerId),
          eq(interactions.kind, 'caress'),
          eq(interactions.day, this.players.today()),
        ),
      );
    return new Set(rows.map((row) => row.petId));
  }
}

function notFound() {
  return new NotFoundException({
    statusCode: 404,
    message: 'Ce compagnon n’est plus là.',
    code: 'no_pet',
  });
}
