import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Database } from '../database/database.js';
import { encounters, favorites, interactions, pets, players, walks } from '../database/schema.js';
import type { Contacts } from './affinity.js';

/** The players a player follows, and how close they are to the others. */
@Injectable()
export class FavoritesService {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  async set(viewerId: string, playerId: string, favorite: boolean): Promise<boolean> {
    if (viewerId === playerId) {
      throw new BadRequestException({ statusCode: 400, code: 'own_profile' });
    }
    const [target] = await this.db
      .select({ id: players.id })
      .from(players)
      .where(eq(players.id, playerId));
    if (!target) throw new NotFoundException({ statusCode: 404, code: 'no_player' });
    if (favorite) {
      await this.db
        .insert(favorites)
        .values({ playerId: viewerId, favoriteId: playerId })
        .onConflictDoNothing();
    } else {
      await this.db
        .delete(favorites)
        .where(and(eq(favorites.playerId, viewerId), eq(favorites.favoriteId, playerId)));
    }
    return favorite;
  }

  async ids(viewerId: string): Promise<Set<string>> {
    const rows = await this.db
      .select({ id: favorites.favoriteId })
      .from(favorites)
      .where(eq(favorites.playerId, viewerId));
    return new Set(rows.map((row) => row.id));
  }

  /** Per other player: the caresses and gifts exchanged with the viewer, and the walks shared. */
  async contacts(viewerId: string): Promise<Map<string, Contacts>> {
    const result = new Map<string, Contacts>();
    const of = (playerId: string): Contacts => {
      const known = result.get(playerId);
      if (known) return known;
      const contacts: Contacts = { interactions: 0, encounters: 0 };
      result.set(playerId, contacts);
      return contacts;
    };

    const rows = await this.db
      .select({ actorId: interactions.actorId, ownerId: pets.ownerId })
      .from(interactions)
      .innerJoin(pets, eq(pets.id, interactions.petId))
      .where(or(eq(interactions.actorId, viewerId), eq(pets.ownerId, viewerId)));
    for (const { actorId, ownerId } of rows) {
      of(actorId === viewerId ? ownerId : actorId).interactions += 1;
    }

    const walkA = alias(walks, 'walk_a');
    const walkB = alias(walks, 'walk_b');
    const petA = alias(pets, 'pet_a');
    const petB = alias(pets, 'pet_b');
    const met = await this.db
      .select({ a: petA.ownerId, b: petB.ownerId })
      .from(encounters)
      .innerJoin(walkA, eq(walkA.id, encounters.walkA))
      .innerJoin(walkB, eq(walkB.id, encounters.walkB))
      .innerJoin(petA, eq(petA.id, walkA.petId))
      .innerJoin(petB, eq(petB.id, walkB.petId))
      .where(or(eq(petA.ownerId, viewerId), eq(petB.ownerId, viewerId)));
    for (const { a, b } of met) of(a === viewerId ? b : a).encounters += 1;

    result.delete(viewerId);
    return result;
  }
}
