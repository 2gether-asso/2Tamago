import { Injectable } from '@nestjs/common';
import {
  applyAction,
  boosted,
  DEFAULT_ZONE,
  isAccessory,
  rollFinds,
  type GameRules,
  type ItemId,
  type WalkZoneId,
} from '@2tamago/core';
import type {
  ActionResponse,
  Notice,
  WalkEncounter,
  WalkEventDto,
  WalkResponse,
} from '@2tamago/core/contracts';
import {
  aliasedTable,
  and,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  ne,
  not,
  or,
  sql,
} from 'drizzle-orm';
import { AnnouncementService } from '../announcements/announcement.service.js';
import { ActivityService } from '../activity/activity.service.js';
import { EventsService } from '../events/events.service.js';
import { GameRulesService } from '../game/game-rules.service.js';
import type { Transaction } from '../database/database.js';
import { encounters, pets, players, walks } from '../database/schema.js';
import { toPetDto } from '../pets/pet-mapper.js';
import { PetsService } from '../pets/pets.service.js';
import { PlayersService } from '../players/players.service.js';
import { CommunityService } from './community.service.js';

const MAX_ENCOUNTERS = 3;

/**
 * Walks: the pet goes out for a while, finds things, and meets the pets of
 * other players who were out at the same time (asynchronous multiplayer, like
 * a street-pass).
 */
@Injectable()
export class WalksService {
  constructor(
    private readonly gameRules: GameRulesService,
    private readonly pets: PetsService,
    private readonly players: PlayersService,
    private readonly activity: ActivityService,
    private readonly announcements: AnnouncementService,
    private readonly community: CommunityService,
    private readonly events: EventsService,
  ) {}

  private get rules(): GameRules {
    return this.gameRules.current;
  }

  async start(playerId: string, zone: WalkZoneId = DEFAULT_ZONE): Promise<ActionResponse> {
    const result = await this.pets.mutate(
      eq(pets.ownerId, playerId),
      async (state, now, tx, row) => {
        const change = applyAction(state, { type: 'startOuting', zone }, now, this.rules);
        const outing = change.state.outing!;
        await tx.insert(walks).values({
          petId: row.id,
          zone,
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
    // Asked before the transaction: it uses the pool, which the transaction must not.
    const walkBonus = await this.events.percent('walk_coins');
    const result = await this.pets.mutate(
      eq(pets.ownerId, playerId),
      async (state, now, tx, row) => {
        // Walks begun before zones existed have none: they were in the meadow.
        const zone = state.outing?.zone ?? DEFAULT_ZONE;
        const change = applyAction(state, { type: 'endOuting' }, now, this.rules);
        const [walk] = await tx
          .update(walks)
          .set({ returnedAt: new Date(now) })
          .where(and(eq(walks.petId, row.id), isNull(walks.returnedAt)))
          .returning();

        const rolled = rollFinds(zone, Math.random);
        // An accessory is kept once: finding one already owned brings nothing.
        const items: ItemId[] = [];
        for (const item of rolled.items) {
          if (!isAccessory(item) || !(await this.players.hasItem(tx, playerId, item))) {
            items.push(item);
          }
        }
        // What the walk event brings (the engine only says it, the server hands it over).
        const walkEvent = change.events.find((event) => event.type === 'walk_event')!
          .data as unknown as WalkEventDto;
        if (walkEvent.item) {
          const kept = !isAccessory(walkEvent.item as ItemId);
          if (kept || !(await this.players.hasItem(tx, playerId, walkEvent.item as ItemId))) {
            items.push(walkEvent.item as ItemId);
          }
        }
        const found = {
          coins: boosted(rolled.coins + (walkEvent.coins ?? 0), walkBonus),
          items,
        };
        await this.players.addCoins(tx, playerId, found.coins);
        for (const item of found.items) await this.players.addItem(tx, playerId, item);

        const meetings = walk
          ? await this.meet(tx, walk, row.id, state.name, playerId)
          : { met: [], first: new Set<string>() };
        const goalReached = await this.community.walkCompleted(tx);
        return { ...change, extra: { zone, found, walkEvent, goalReached, ...meetings } };
      },
    );

    const { zone, found, walkEvent, met, first, goalReached } = result.extra!;
    if (goalReached !== null) this.announcements.communityGoal(goalReached);
    // Once saved: only the first walk two players ever share is worth the channel's attention.
    for (const encounter of met) {
      if (!first.has(encounter.petId)) continue;
      this.announcements.firstMeeting(
        { petName: result.row.state.name, ownerName: result.ownerName },
        { petName: encounter.name, ownerName: encounter.ownerName },
      );
    }
    const notices: Notice[] = [{ code: 'walk_found_coins', count: found.coins }];
    for (const item of found.items) notices.push({ code: 'walk_found_item', item });
    for (const encounter of met) {
      notices.push({ code: 'walk_met', petName: encounter.name, ownerName: encounter.ownerName });
    }
    return {
      pet: toPetDto(result.row, result.ownerName),
      events: result.events,
      coins: await this.players.coinsOf(playerId),
      notices,
      zone,
      walkEvent,
      found,
      encounters: met,
    };
  }

  /**
   * Records encounters with overlapping walks. Returns everyone met, and which of them (by pet)
   * the player had never met before.
   */
  private async meet(
    tx: Transaction,
    walk: typeof walks.$inferSelect,
    petId: string,
    petName: string,
    playerId: string,
  ): Promise<{ met: WalkEncounter[]; first: Set<string> }> {
    const first = new Set<string>();
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
        .select({ ownerId: pets.ownerId, petId: pets.id })
        .from(walks)
        .innerJoin(pets, eq(pets.id, walks.petId))
        .where(eq(walks.id, other.id));
      if (otherPet) {
        await this.activity.record(tx, otherPet.ownerId, 'encounter', {
          otherPetName: petName,
          otherOwnerName: me.displayName,
        });
        if (!(await this.haveMet(tx, playerId, otherPet.ownerId, walkA, walkB))) {
          first.add(otherPet.petId);
        }
      }
    }

    const links = await tx
      .select()
      .from(encounters)
      .where(or(eq(encounters.walkA, walk.id), eq(encounters.walkB, walk.id)));
    const otherWalkIds = links.map((link) => (link.walkA === walk.id ? link.walkB : link.walkA));
    if (otherWalkIds.length === 0) return { met: [], first };

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
    return { met: result, first };
  }

  /** Whether these two players had an encounter before the one made by walks `walkA` and `walkB`. */
  private async haveMet(
    tx: Transaction,
    playerId: string,
    otherPlayerId: string,
    walkA: string,
    walkB: string,
  ): Promise<boolean> {
    const first = aliasedTable(walks, 'first_walk');
    const second = aliasedTable(walks, 'second_walk');
    const firstPet = aliasedTable(pets, 'first_pet');
    const secondPet = aliasedTable(pets, 'second_pet');
    const [previous] = await tx
      .select({ one: sql<number>`1` })
      .from(encounters)
      .innerJoin(first, eq(first.id, encounters.walkA))
      .innerJoin(firstPet, eq(firstPet.id, first.petId))
      .innerJoin(second, eq(second.id, encounters.walkB))
      .innerJoin(secondPet, eq(secondPet.id, second.petId))
      .where(
        and(
          or(
            and(eq(firstPet.ownerId, playerId), eq(secondPet.ownerId, otherPlayerId)),
            and(eq(firstPet.ownerId, otherPlayerId), eq(secondPet.ownerId, playerId)),
          ),
          not(and(eq(encounters.walkA, walkA), eq(encounters.walkB, walkB))!),
        ),
      )
      .limit(1);
    return previous !== undefined;
  }
}
