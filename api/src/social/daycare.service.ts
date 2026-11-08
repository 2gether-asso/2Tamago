import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { applyAction, type GameRules } from '@2tamago/core';
import type {
  ActionResponse,
  CareActionBody,
  DaycareDto,
  DaycareOverview,
  Notice,
} from '@2tamago/core/contracts';
import { aliasedTable, and, count, eq, gt, inArray, lte, ne, or, type SQL } from 'drizzle-orm';
import { ActivityService } from '../activity/activity.service.js';
import { Clock } from '../common/clock.js';
import type { Database, Executor } from '../database/database.js';
import { daycares, pets, players } from '../database/schema.js';
import { GameRulesService } from '../game/game-rules.service.js';
import { toPetDto } from '../pets/pet-mapper.js';
import { PetsService } from '../pets/pets.service.js';
import { PlayersService } from '../players/players.service.js';
import { DAYCARE, HOUR_MS, isJournaled, REWARDED_CARE } from './daycare.js';

const noDaycare = () => new NotFoundException({ statusCode: 404, code: 'no_daycare' });

/**
 * The daycare: an owner entrusts their living companion to another member, who accepts and then
 * looks after it (feeding, cleaning…) while the owner is away. Time keeps running, unlike on
 * vacation. Stays and invitations end by themselves (`DAYCARE`), and with the companion.
 */
@Injectable()
export class DaycareService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly clock: Clock,
    private readonly gameRules: GameRulesService,
    private readonly pets: PetsService,
    private readonly players: PlayersService,
    private readonly activity: ActivityService,
  ) {}

  private get rules(): GameRules {
    return this.gameRules.current;
  }

  /** What the viewer entrusted, looks after, and has been asked to look after. */
  async overview(viewerId: string): Promise<DaycareOverview> {
    await this.endStale();
    const mine = await this.dtos(
      or(eq(daycares.ownerId, viewerId), eq(daycares.caretakerId, viewerId))!,
    );
    return {
      entrusted: mine.find((d) => d.ownerId === viewerId) ?? null,
      caring: mine.filter((d) => d.caretakerId === viewerId && d.status === 'active'),
      invitations: mine.filter((d) => d.caretakerId === viewerId && d.status === 'pending'),
    };
  }

  /** The id of the stay in which the viewer looks after this pet right now, if any. */
  async activeFor(viewerId: string, petId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ id: daycares.id })
      .from(daycares)
      .where(
        and(
          eq(daycares.petId, petId),
          eq(daycares.caretakerId, viewerId),
          eq(daycares.status, 'active'),
          gt(daycares.expiresAt, new Date(this.clock.now())),
        ),
      );
    return row?.id ?? null;
  }

  async invite(ownerId: string, caretakerId: string): Promise<DaycareDto> {
    await this.endStale();
    if (ownerId === caretakerId) {
      throw new BadRequestException({ statusCode: 400, code: 'own_profile' });
    }
    const [caretaker] = await this.db.select().from(players).where(eq(players.id, caretakerId));
    if (!caretaker) throw new NotFoundException({ statusCode: 404, code: 'no_player' });
    const owner = await this.players.get(this.db, ownerId);
    const [pet] = await this.db
      .select()
      .from(pets)
      .where(and(eq(pets.ownerId, ownerId), eq(pets.status, 'alive')));
    if (!pet) throw new NotFoundException({ statusCode: 404, code: 'no_pet' });
    // On vacation it needs nothing: no point in a caretaker.
    if (pet.state.vacationSince != null) {
      throw new ConflictException({ statusCode: 409, code: 'on_vacation' });
    }
    if ((await this.activeCharges(this.db, caretakerId)) >= DAYCARE.maxCharges) {
      throw new ConflictException({ statusCode: 409, code: 'daycare_full' });
    }

    const now = this.clock.now();
    const inserted = await this.db
      .insert(daycares)
      .values({
        petId: pet.id,
        ownerId,
        caretakerId,
        status: 'pending',
        expiresAt: new Date(now + DAYCARE.inviteHours * HOUR_MS),
      })
      .onConflictDoNothing()
      .returning();
    if (inserted.length === 0) {
      throw new ConflictException({ statusCode: 409, code: 'daycare_exists' });
    }
    await this.activity.record(this.db, caretakerId, 'daycare_invite', {
      ownerName: owner.displayName,
      petName: pet.state.name,
    });
    return (await this.dtos(eq(daycares.id, inserted[0]!.id)))[0]!;
  }

  async accept(caretakerId: string, id: string): Promise<DaycareDto> {
    await this.endStale();
    const row = await this.open(id);
    if (row.caretakerId !== caretakerId || row.status !== 'pending') throw noDaycare();
    if ((await this.activeCharges(this.db, caretakerId)) >= DAYCARE.maxCharges) {
      throw new ConflictException({ statusCode: 409, code: 'daycare_full' });
    }
    const caretaker = await this.players.get(this.db, caretakerId);
    await this.db
      .update(daycares)
      .set({
        status: 'active',
        expiresAt: new Date(this.clock.now() + DAYCARE.maxDays * 24 * HOUR_MS),
      })
      .where(eq(daycares.id, id));
    await this.activity.record(this.db, row.ownerId, 'daycare_accepted', {
      caretakerName: caretaker.displayName,
      petName: await this.petName(row.petId),
    });
    return (await this.dtos(eq(daycares.id, id)))[0]!;
  }

  async decline(caretakerId: string, id: string): Promise<void> {
    await this.endStale();
    const row = await this.open(id);
    if (row.caretakerId !== caretakerId || row.status !== 'pending') throw noDaycare();
    const caretaker = await this.players.get(this.db, caretakerId);
    await this.finish(id);
    await this.activity.record(this.db, row.ownerId, 'daycare_declined', {
      caretakerName: caretaker.displayName,
      petName: await this.petName(row.petId),
    });
  }

  /** The owner takes the companion back (or cancels the invitation), or the caretaker gives it back. */
  async end(viewerId: string, id: string): Promise<void> {
    await this.endStale();
    const row = await this.open(id);
    if (row.ownerId !== viewerId && row.caretakerId !== viewerId) throw noDaycare();
    await this.finish(id);
    const other = row.ownerId === viewerId ? row.caretakerId : row.ownerId;
    if (row.status === 'active' || other === row.ownerId) {
      await this.activity.record(this.db, other, 'daycare_ended', {
        petName: await this.petName(row.petId),
      });
    }
  }

  /** A care action by the caretaker. The change goes through `PetsService.mutate`, like any other. */
  async care(caretakerId: string, id: string, action: CareActionBody): Promise<ActionResponse> {
    await this.endStale();
    const row = await this.open(id);
    if (row.caretakerId !== caretakerId || row.status !== 'active') throw noDaycare();
    const caretaker = await this.players.get(this.db, caretakerId);
    const notices: Notice[] = [];
    const result = await this.pets.mutate(eq(pets.id, row.petId), async (state, now, tx) => {
      const change = applyAction(state, action, now, this.rules);
      if (REWARDED_CARE.has(action.type)) {
        const earned = await this.players.earnCappedReward(tx, caretakerId, DAYCARE.careReward);
        if (earned > 0) notices.push({ code: 'coins_earned', count: earned });
      }
      if (isJournaled(action.type)) {
        await this.activity.record(tx, row.ownerId, 'daycare_care', {
          caretakerName: caretaker.displayName,
          petName: state.name,
          action: action.type,
        });
      }
      return change;
    });
    return {
      pet: toPetDto(result.row, result.ownerName),
      events: result.events,
      coins: await this.players.coinsOf(caretakerId),
      notices,
    };
  }

  /** Ends what ran out of time, or whose companion is gone, and tells the owner. */
  private async endStale(): Promise<void> {
    const now = new Date(this.clock.now());
    const gone = this.db.select({ id: pets.id }).from(pets).where(ne(pets.status, 'alive'));
    const stale = await this.db
      .select({ id: daycares.id, ownerId: daycares.ownerId, petId: daycares.petId })
      .from(daycares)
      .where(
        and(
          ne(daycares.status, 'ended'),
          or(lte(daycares.expiresAt, now), inArray(daycares.petId, gone)),
        ),
      );
    for (const row of stale) {
      // Another request may have ended it in the meantime: only the one that did tells the owner.
      const ended = await this.db
        .update(daycares)
        .set({ status: 'ended', endedAt: now })
        .where(and(eq(daycares.id, row.id), ne(daycares.status, 'ended')))
        .returning({ id: daycares.id });
      if (ended.length > 0) {
        await this.activity.record(this.db, row.ownerId, 'daycare_ended', {
          petName: await this.petName(row.petId),
        });
      }
    }
  }

  private async finish(id: string): Promise<void> {
    await this.db
      .update(daycares)
      .set({ status: 'ended', endedAt: new Date(this.clock.now()) })
      .where(eq(daycares.id, id));
  }

  private async open(id: string) {
    const [row] = await this.db
      .select()
      .from(daycares)
      .where(and(eq(daycares.id, id), ne(daycares.status, 'ended')));
    if (!row) throw noDaycare();
    return row;
  }

  private async activeCharges(executor: Executor, caretakerId: string): Promise<number> {
    const [row] = await executor
      .select({ n: count() })
      .from(daycares)
      .where(and(eq(daycares.caretakerId, caretakerId), eq(daycares.status, 'active')));
    return row?.n ?? 0;
  }

  private async petName(petId: string): Promise<string> {
    const [pet] = await this.db.select({ state: pets.state }).from(pets).where(eq(pets.id, petId));
    return pet?.state.name ?? '';
  }

  private async dtos(where: SQL): Promise<DaycareDto[]> {
    const owner = aliasedTable(players, 'owner');
    const caretaker = aliasedTable(players, 'caretaker');
    const rows = await this.db
      .select({
        daycare: daycares,
        petState: pets.state,
        ownerName: owner.displayName,
        caretakerName: caretaker.displayName,
      })
      .from(daycares)
      .innerJoin(pets, eq(pets.id, daycares.petId))
      .innerJoin(owner, eq(owner.id, daycares.ownerId))
      .innerJoin(caretaker, eq(caretaker.id, daycares.caretakerId))
      .where(and(ne(daycares.status, 'ended'), where));
    return rows.map(({ daycare, petState, ownerName, caretakerName }) => ({
      id: daycare.id,
      status: daycare.status as 'pending' | 'active',
      petId: daycare.petId,
      petName: petState.name,
      ownerId: daycare.ownerId,
      ownerName,
      caretakerId: daycare.caretakerId,
      caretakerName,
      expiresAt: daycare.expiresAt.getTime(),
    }));
  }
}
