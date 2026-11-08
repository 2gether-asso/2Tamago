import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { ageInDays, type GameRules } from '@2tamago/core';
import type { PlayerProfile, PlayerStats } from '@2tamago/core/contracts';
import { and, count, eq, inArray, isNotNull, or } from 'drizzle-orm';
import { Clock } from '../common/clock.js';
import type { Database } from '../database/database.js';
import { encounters, interactions, pets, players, walks } from '../database/schema.js';
import { GameRulesService } from '../game/game-rules.service.js';
import { toPetDto } from '../pets/pet-mapper.js';
import { PetsService } from '../pets/pets.service.js';

/** The public profile of a player: who they are, what they did, and their living companion. */
@Injectable()
export class ProfileService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly gameRules: GameRulesService,
    private readonly clock: Clock,
    private readonly pets: PetsService,
  ) {}

  private get rules(): GameRules {
    return this.gameRules.current;
  }

  async get(viewerId: string, playerId: string): Promise<PlayerProfile> {
    const [player] = await this.db.select().from(players).where(eq(players.id, playerId));
    if (!player) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Ce joueur est introuvable.',
        code: 'no_player',
      });
    }
    const living = await this.pets.sync(and(eq(pets.ownerId, playerId), eq(pets.status, 'alive'))!);
    return {
      player: {
        id: player.id,
        displayName: player.displayName,
        avatarUrl: player.avatarUrl,
        memberSince: player.createdAt.getTime(),
        isYou: player.id === viewerId,
      },
      stats: await this.stats(playerId),
      pet: living ? toPetDto(living.row, living.ownerName) : null,
    };
  }

  private async stats(playerId: string): Promise<PlayerStats> {
    const now = this.clock.now();
    const rows = await this.db
      .select({ state: pets.state })
      .from(pets)
      .where(eq(pets.ownerId, playerId));
    const given = await this.interactionCounts(eq(interactions.actorId, playerId));
    const received = await this.interactionCounts(eq(pets.ownerId, playerId));

    const ownerWalks = this.db
      .select({ id: walks.id })
      .from(walks)
      .innerJoin(pets, eq(pets.id, walks.petId))
      .where(eq(pets.ownerId, playerId));
    const [walkCount] = await this.db
      .select({ n: count() })
      .from(walks)
      .innerJoin(pets, eq(pets.id, walks.petId))
      .where(and(eq(pets.ownerId, playerId), isNotNull(walks.returnedAt)));
    const [encounterCount] = await this.db
      .select({ n: count() })
      .from(encounters)
      .where(or(inArray(encounters.walkA, ownerWalks), inArray(encounters.walkB, ownerWalks)));

    return {
      companions: rows.length,
      retired: rows.filter(({ state }) => state.status === 'retired').length,
      departed: rows.filter(({ state }) => state.status === 'gone').length,
      bestAgeDays: rows.reduce(
        (best, { state }) => Math.max(best, ageInDays(state, now, this.rules)),
        0,
      ),
      caressesGiven: given.caress,
      giftsGiven: given.gift,
      caressesReceived: received.caress,
      giftsReceived: received.gift,
      walks: walkCount?.n ?? 0,
      encounters: encounterCount?.n ?? 0,
    };
  }

  /** Caresses and gifts matching `where` (on `interactions` joined to the pet they went to). */
  private async interactionCounts(where: ReturnType<typeof eq>) {
    const rows = await this.db
      .select({ kind: interactions.kind, n: count() })
      .from(interactions)
      .innerJoin(pets, eq(pets.id, interactions.petId))
      .where(where)
      .groupBy(interactions.kind);
    const totals = { caress: 0, gift: 0 };
    for (const row of rows) totals[row.kind] = row.n;
    return totals;
  }
}
