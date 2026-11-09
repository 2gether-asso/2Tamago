import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import {
  CONTEST_BOARD_SIZE,
  CONTEST_KINDS,
  contestProblem,
  moodOf,
  prizeFor,
  rankEntries,
  simulate,
  trickScore,
  traitsOf,
  type ContestKind,
  type GameRules,
  type PetState,
} from '@2tamago/core';
import type {
  ContestBoard,
  ContestClaimResponse,
  ContestEntryDto,
  ContestResults,
  ContestsOverview,
} from '@2tamago/core/contracts';
import { and, count, eq, isNull } from 'drizzle-orm';
import { Clock, weekOf, type Week } from '../common/clock.js';
import { AppConfig } from '../config/app-config.js';
import type { Database } from '../database/database.js';
import { contestEntries, contestVotes, pets, players } from '../database/schema.js';
import { GameRulesService } from '../game/game-rules.service.js';
import { PetsService } from '../pets/pets.service.js';
import { PlayersService } from '../players/players.service.js';

interface Row {
  playerId: string;
  playerName: string;
  petId: string;
  petState: PetState;
  score: number;
  enteredAt: number;
  claimed: boolean;
}
type RankedRow = Row & { rank: number };

/**
 * Weekly contests: tricks (the score is what the pet has learned when it enters) and beauty
 * (the community votes, once a week each). Weeks run Monday to Sunday like the community goal;
 * the first three of last week's contests can take a prize.
 */
@Injectable()
export class ContestsService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly clock: Clock,
    private readonly config: AppConfig,
    private readonly players: PlayersService,
    private readonly pets: PetsService,
    private readonly gameRules: GameRulesService,
  ) {}

  private get rules(): GameRules {
    return this.gameRules.current;
  }

  private week(): Week {
    return weekOf(this.clock.now(), this.config.game.timezone);
  }

  private lastWeek(week: Week): Week {
    return weekOf(week.startsAt - 1, this.config.game.timezone);
  }

  async overview(viewerId: string): Promise<ContestsOverview> {
    const week = this.week();
    const pet = await this.livingPet(viewerId);
    const votedFor = await this.voteOf(week.id, viewerId);
    const [tricks, beauty] = await Promise.all(
      CONTEST_KINDS.map((kind) => this.board(week.id, kind, viewerId, pet, votedFor)),
    );
    return {
      week: week.id,
      endsAt: week.endsAt,
      tricks: tricks!,
      beauty: beauty!,
      last: await this.results(this.lastWeek(week).id, viewerId),
    };
  }

  /** Enters (or, for tricks, enters again with what the pet has learned since). */
  async enter(playerId: string, kind: ContestKind): Promise<ContestBoard> {
    const week = this.week();
    const pet = await this.livingPet(playerId);
    if (!pet) throw new NotFoundException({ statusCode: 404, code: 'no_pet' });
    const problem = contestProblem(kind, pet.state);
    if (problem) throw new ConflictException({ statusCode: 409, code: problem });
    const score = kind === 'tricks' ? trickScore(pet.state) : 0;
    await this.db
      .insert(contestEntries)
      .values({ week: week.id, kind, playerId, petId: pet.id, score })
      .onConflictDoUpdate({
        target: [contestEntries.week, contestEntries.kind, contestEntries.playerId],
        set: { petId: pet.id, score },
      });
    return this.board(week.id, kind, playerId, pet, await this.voteOf(week.id, playerId));
  }

  /** One vote a week, for another member's entry; voting again moves it. */
  async vote(voterId: string, candidateId: string): Promise<ContestBoard> {
    if (voterId === candidateId) {
      throw new BadRequestException({ statusCode: 400, code: 'own_profile' });
    }
    const week = this.week();
    const [entry] = await this.db
      .select({ playerId: contestEntries.playerId })
      .from(contestEntries)
      .where(
        and(
          eq(contestEntries.week, week.id),
          eq(contestEntries.kind, 'beauty'),
          eq(contestEntries.playerId, candidateId),
        ),
      );
    if (!entry) throw new NotFoundException({ statusCode: 404, code: 'no_entry' });
    await this.db
      .insert(contestVotes)
      .values({ week: week.id, voterId, candidateId })
      .onConflictDoUpdate({
        target: [contestVotes.week, contestVotes.voterId],
        set: { candidateId, createdAt: new Date(this.clock.now()) },
      });
    return this.board(week.id, 'beauty', voterId, await this.livingPet(voterId), candidateId);
  }

  /** Takes the prize of a place on last week's podium, once. */
  async claim(playerId: string, kind: ContestKind): Promise<ContestClaimResponse> {
    const last = this.lastWeek(this.week());
    const mine = (await this.ranked(last.id, kind)).find((row) => row.playerId === playerId);
    const prize = mine ? prizeFor(mine.rank) : 0;
    if (prize === 0) throw new ConflictException({ statusCode: 409, code: 'no_prize' });
    await this.db.transaction(async (tx) => {
      const taken = await tx
        .update(contestEntries)
        .set({ claimedAt: new Date(this.clock.now()) })
        .where(
          and(
            eq(contestEntries.week, last.id),
            eq(contestEntries.kind, kind),
            eq(contestEntries.playerId, playerId),
            // One statement decides: two requests at once cannot both be paid.
            isNull(contestEntries.claimedAt),
          ),
        )
        .returning({ playerId: contestEntries.playerId });
      if (taken.length === 0) {
        throw new ConflictException({ statusCode: 409, code: 'already_claimed' });
      }
      await this.players.addCoins(tx, playerId, prize);
    });
    return { prize, coins: await this.players.coinsOf(playerId) };
  }

  private async board(
    weekId: string,
    kind: ContestKind,
    viewerId: string,
    pet: { state: PetState } | null,
    votedFor: string | null,
  ): Promise<ContestBoard> {
    const ranked = await this.ranked(weekId, kind);
    const dto = (row: RankedRow) =>
      toDto(row, viewerId, kind === 'beauty' && row.playerId === votedFor);
    const mine = ranked.find((row) => row.playerId === viewerId);
    return {
      kind,
      entries: ranked.slice(0, CONTEST_BOARD_SIZE).map(dto),
      mine: mine ? dto(mine) : null,
      problem: pet ? contestProblem(kind, pet.state) : 'pet_gone',
    };
  }

  private async results(weekId: string, viewerId: string): Promise<ContestsOverview['last']> {
    const results: ContestResults[] = [];
    for (const kind of CONTEST_KINDS) {
      const ranked = await this.ranked(weekId, kind);
      if (ranked.length === 0) continue;
      const mine = ranked.find((row) => row.playerId === viewerId);
      results.push({
        kind,
        podium: ranked.slice(0, 3).map((row) => toDto(row, viewerId, false)),
        mine: mine ? toDto(mine, viewerId, false) : null,
        prize: mine ? prizeFor(mine.rank) : 0,
        claimed: mine?.claimed ?? false,
      });
    }
    return results.length > 0 ? { week: weekId, results } : null;
  }

  /** Every entry of a contest, best first. */
  private async ranked(weekId: string, kind: ContestKind): Promise<RankedRow[]> {
    const rows = await this.db
      .select({
        entry: contestEntries,
        playerName: players.displayName,
        petState: pets.state,
      })
      .from(contestEntries)
      .innerJoin(players, eq(players.id, contestEntries.playerId))
      .innerJoin(pets, eq(pets.id, contestEntries.petId))
      .where(and(eq(contestEntries.week, weekId), eq(contestEntries.kind, kind)));
    const votes = new Map<string, number>();
    if (kind === 'beauty') {
      const counted = await this.db
        .select({ candidateId: contestVotes.candidateId, n: count() })
        .from(contestVotes)
        .where(eq(contestVotes.week, weekId))
        .groupBy(contestVotes.candidateId);
      for (const { candidateId, n } of counted) votes.set(candidateId, n);
    }
    return rankEntries(
      rows.map(({ entry, playerName, petState }) => ({
        playerId: entry.playerId,
        playerName,
        petId: entry.petId,
        // A preview, as in the village: the stored state may be older than what the pet is now.
        petState: simulate(petState, this.clock.now(), this.rules).state,
        score: kind === 'beauty' ? (votes.get(entry.playerId) ?? 0) : entry.score,
        enteredAt: entry.createdAt.getTime(),
        claimed: entry.claimedAt !== null,
      })),
    );
  }

  private async voteOf(weekId: string, voterId: string): Promise<string | null> {
    const [vote] = await this.db
      .select({ candidateId: contestVotes.candidateId })
      .from(contestVotes)
      .where(and(eq(contestVotes.week, weekId), eq(contestVotes.voterId, voterId)));
    return vote?.candidateId ?? null;
  }

  /** The member's living companion, brought up to date (what is stored may lag behind). */
  private async livingPet(playerId: string) {
    const found = await this.pets.sync(and(eq(pets.ownerId, playerId), eq(pets.status, 'alive'))!);
    return found ? { id: found.row.id, state: found.row.state } : null;
  }
}

function toDto(row: RankedRow, viewerId: string, votedByMe: boolean): ContestEntryDto {
  const state = row.petState;
  return {
    rank: row.rank,
    playerId: row.playerId,
    playerName: row.playerName,
    petId: row.petId,
    petName: state.name,
    species: state.species,
    stage: state.stage,
    form: state.form,
    color: state.color,
    traits: state.stage === 'egg' ? null : traitsOf(state),
    equipped: state.equipped,
    mood: moodOf(state),
    score: row.score,
    isMine: row.playerId === viewerId,
    votedByMe,
  };
}
