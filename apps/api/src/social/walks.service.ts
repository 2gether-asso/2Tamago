import { Inject, Injectable } from '@nestjs/common';
import { applyAction, ITEMS, isSnack, type GameRules, type ItemId } from '@2tamago/core';
import type { WalkEncounter, WalkResponse, ActionResponse } from '@2tamago/core/contracts';
import { aliasedTable, and, desc, eq, gt, inArray, isNull, lt, ne, or } from 'drizzle-orm';
import { ActivityService } from '../activity/activity.service.js';
import { GAME_RULES } from '../common/tokens.js';
import type { Transaction } from '../database/database.js';
import { encounters, pets, players, walks } from '../database/schema.js';
import { toPetDto } from '../pets/pet-mapper.js';
import { PetsService } from '../pets/pets.service.js';
import { PlayersService } from '../players/players.service.js';

const MAX_ENCOUNTERS = 3;
const SNACKS = (Object.keys(ITEMS) as ItemId[]).filter(isSnack);

/**
 * Walks: the pet goes out for a while, finds things, and meets the pets of
 * other players who were out at the same time (asynchronous multiplayer, like
 * a street-pass).
 */
@Injectable()
export class WalksService {
  constructor(
    @Inject(GAME_RULES) private readonly rules: GameRules,
    private readonly pets: PetsService,
    private readonly players: PlayersService,
    private readonly activity: ActivityService,
  ) {}

  async start(playerId: string): Promise<ActionResponse> {
    const result = await this.pets.mutate(
      eq(pets.ownerId, playerId),
      async (state, now, tx, row) => {
        const change = applyAction(state, { type: 'startOuting' }, now, this.rules);
        const outing = change.state.outing!;
        await tx.insert(walks).values({
          petId: row.id,
          startedAt: new Date(outing.startedAt),
          endsAt: new Date(outing.endsAt),
        });
        return change;
      },
    );
    return {
      pet: toPetDto(result.row, result.ownerName),
      events: result.events,
      coins: await this.players.coinsOf(playerId),
      notices: [],
    };
  }

  async return(playerId: string): Promise<WalkResponse> {
    const result = await this.pets.mutate(
      eq(pets.ownerId, playerId),
      async (state, now, tx, row) => {
        const change = applyAction(state, { type: 'endOuting' }, now, this.rules);
        const [walk] = await tx
          .update(walks)
          .set({ returnedAt: new Date(now) })
          .where(and(eq(walks.petId, row.id), isNull(walks.returnedAt)))
          .returning();

        const found = { coins: 5 + Math.floor(Math.random() * 11), items: [] as ItemId[] };
        if (Math.random() < 0.25)
          found.items.push(SNACKS[Math.floor(Math.random() * SNACKS.length)]!);
        await this.players.addCoins(tx, playerId, found.coins);
        for (const item of found.items) await this.players.addItem(tx, playerId, item);

        const met = walk ? await this.meet(tx, walk, row.id, state.name, playerId) : [];
        return { ...change, extra: { found, met } };
      },
    );

    const { found, met } = result.extra!;
    const notices = [`+${found.coins} pièces trouvées`];
    for (const item of found.items) notices.push(`Trouvé : ${ITEMS[item].label}`);
    for (const encounter of met)
      notices.push(`Rencontre avec ${encounter.name} (${encounter.ownerName})`);
    return {
      pet: toPetDto(result.row, result.ownerName),
      events: result.events,
      coins: await this.players.coinsOf(playerId),
      notices,
      found,
      encounters: met,
    };
  }

  /** Records encounters with overlapping walks, and returns everyone met. */
  private async meet(
    tx: Transaction,
    walk: typeof walks.$inferSelect,
    petId: string,
    petName: string,
    playerId: string,
  ): Promise<WalkEncounter[]> {
    const overlapping = await tx
      .select({ id: walks.id })
      .from(walks)
      .where(
        and(
          ne(walks.petId, petId),
          lt(walks.startedAt, walk.endsAt),
          gt(walks.endsAt, walk.startedAt),
        ),
      )
      .orderBy(desc(walks.startedAt))
      .limit(MAX_ENCOUNTERS);

    const me = await this.players.get(tx, playerId);
    for (const other of overlapping) {
      const [walkA, walkB] = [walk.id, other.id].sort() as [string, string];
      const inserted = await tx
        .insert(encounters)
        .values({ walkA, walkB })
        .onConflictDoNothing()
        .returning();
      if (inserted.length === 0) continue;
      // Tell the other owner, who may not be online.
      const [otherPet] = await tx
        .select({ ownerId: pets.ownerId })
        .from(walks)
        .innerJoin(pets, eq(pets.id, walks.petId))
        .where(eq(walks.id, other.id));
      if (otherPet) {
        await this.activity.record(tx, otherPet.ownerId, 'encounter', {
          otherPetName: petName,
          otherOwnerName: me.displayName,
        });
      }
    }

    const links = await tx
      .select()
      .from(encounters)
      .where(or(eq(encounters.walkA, walk.id), eq(encounters.walkB, walk.id)));
    const otherWalkIds = links.map((link) => (link.walkA === walk.id ? link.walkB : link.walkA));
    if (otherWalkIds.length === 0) return [];

    const otherWalk = aliasedTable(walks, 'other_walk');
    const rows = await tx
      .select({ pet: pets, ownerName: players.displayName })
      .from(otherWalk)
      .innerJoin(pets, eq(pets.id, otherWalk.petId))
      .innerJoin(players, eq(players.id, pets.ownerId))
      .where(inArray(otherWalk.id, otherWalkIds));

    const result = rows.map(({ pet, ownerName }) => ({
      petId: pet.id,
      name: pet.state.name,
      species: pet.state.species,
      color: pet.state.color,
      ownerName,
    }));
    for (const encounter of result) {
      await this.activity.record(tx, playerId, 'encounter', {
        otherPetName: encounter.name,
        otherOwnerName: encounter.ownerName,
      });
    }
    return result;
  }
}
