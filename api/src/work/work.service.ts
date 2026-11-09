import { randomInt } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import {
  applyAction,
  petAbility,
  petWage,
  playerWage,
  simulate,
  WORK,
  type GameRules,
} from '@2tamago/core';
import type { PetWorkResponse, WorkResponse, WorkStatus } from '@2tamago/core/contracts';
import { and, eq, isNull, lte, or } from 'drizzle-orm';
import { Clock } from '../common/clock.js';
import type { Database, Executor } from '../database/database.js';
import { pets, players } from '../database/schema.js';
import { GameRulesService } from '../game/game-rules.service.js';
import { toPetDto } from '../pets/pet-mapper.js';
import { PetsService } from '../pets/pets.service.js';
import { PlayersService } from '../players/players.service.js';

const HOUR = 3_600_000;

/**
 * Jobs: the player's skill game and the companion's work, each once per cooldown. The server
 * keeps the cooldowns and draws the seed; the wages come from the engine.
 */
@Injectable()
export class WorkService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly clock: Clock,
    private readonly players: PlayersService,
    private readonly pets: PetsService,
    private readonly gameRules: GameRulesService,
  ) {}

  private get rules(): GameRules {
    return this.gameRules.current;
  }

  async status(playerId: string): Promise<WorkStatus> {
    const player = await this.players.get(this.db, playerId);
    const found = await this.pets.sync(and(eq(pets.ownerId, playerId), eq(pets.status, 'alive'))!);
    const ability = found ? petAbility(found.row.state) : 0;
    const base = WORK.petBaseMin + ability * (WORK.petBaseMax - WORK.petBaseMin);
    return {
      playerAvailableAt: availableAt(player.lastWorkAt, WORK.playerCooldownHours),
      petAvailableAt: availableAt(player.lastPetWorkAt, WORK.petCooldownHours),
      petWageRange: {
        min: Math.max(1, Math.round(base * (1 - WORK.luckSpread))),
        max: Math.max(1, Math.round(base * (1 + WORK.luckSpread))),
      },
    };
  }

  /** The player's skill game: the score is paid, once per cooldown. */
  async workPlayer(playerId: string, score: number): Promise<WorkResponse> {
    const earned = playerWage(score);
    await this.db.transaction(async (tx) => {
      await this.startJob(tx, playerId, 'lastWorkAt', WORK.playerCooldownHours);
      if (earned > 0) await this.players.addCoins(tx, playerId, earned);
    });
    return {
      earned,
      coins: await this.players.coinsOf(playerId),
      status: await this.status(playerId),
    };
  }

  /** The companion works: tired by it, paid by its ability and a seeded luck. */
  async workPet(playerId: string): Promise<PetWorkResponse> {
    const seed = randomInt(2 ** 32);
    const result = await this.pets.mutate(
      and(eq(pets.ownerId, playerId), eq(pets.status, 'alive'))!,
      async (state, now, tx) => {
        const change = applyAction(state, { type: 'work' }, now, this.rules);
        await this.startJob(tx, playerId, 'lastPetWorkAt', WORK.petCooldownHours);
        // Paid for what it was before the job tired it.
        const earned = petWage(simulate(state, now, this.rules).state, seed);
        await this.players.addCoins(tx, playerId, earned);
        return { ...change, extra: earned };
      },
    );
    return {
      earned: result.extra ?? 0,
      coins: await this.players.coinsOf(playerId),
      status: await this.status(playerId),
      pet: toPetDto(result.row, result.ownerName),
      events: result.events,
    };
  }

  /** Takes the cooldown in one statement: two requests at once cannot both work. */
  private async startJob(
    tx: Executor,
    playerId: string,
    column: 'lastWorkAt' | 'lastPetWorkAt',
    hours: number,
  ): Promise<void> {
    const now = this.clock.now();
    const taken = await tx
      .update(players)
      .set({ [column]: new Date(now) })
      .where(
        and(
          eq(players.id, playerId),
          or(isNull(players[column]), lte(players[column], new Date(now - hours * HOUR))),
        ),
      )
      .returning({ id: players.id });
    if (taken.length === 0) {
      const player = await this.players.get(tx, playerId);
      throw new ConflictException({
        statusCode: 409,
        code: 'work_cooldown',
        availableAt: availableAt(player[column], hours),
      });
    }
  }
}

function availableAt(last: Date | null, hours: number): number {
  return last ? last.getTime() + hours * HOUR : 0;
}
