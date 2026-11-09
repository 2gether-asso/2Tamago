import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import type {
  ModerationAction,
  ModerationLogEntry,
  ModerationPerson,
} from '@2tamago/core/contracts';
import { aliasedTable, and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { ActivityService } from '../activity/activity.service.js';
import type { Database } from '../database/database.js';
import { moderationLog, pets, players } from '../database/schema.js';
import { PetsService } from '../pets/pets.service.js';
import { NameFilterService } from './name-filter.service.js';

const noPlayer = () => new NotFoundException({ statusCode: 404, code: 'no_player' });

/** What admins can do about names: find who, rename, give the Discord name back, set the filter. */
@Injectable()
export class ModerationService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly pets: PetsService,
    private readonly activity: ActivityService,
    private readonly filter: NameFilterService,
  ) {}

  /** Members whose name, or whose living companion's name, contains `query`. */
  async search(query: string): Promise<ModerationPerson[]> {
    // `%` and `_` are the wildcards of LIKE: a search for them is a search for the characters.
    const like = `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    const rows = await this.db
      .select({
        playerId: players.id,
        playerName: players.displayName,
        nameLocked: players.nameLocked,
        petId: pets.id,
        petName: sql<string | null>`${pets.state}->>'name'`,
      })
      .from(players)
      .leftJoin(pets, and(eq(pets.ownerId, players.id), eq(pets.status, 'alive')))
      .where(or(ilike(players.displayName, like), sql`${pets.state}->>'name' ilike ${like}`))
      .orderBy(players.displayName)
      .limit(20);
    return rows;
  }

  async renamePet(adminId: string, petId: string, name: string): Promise<void> {
    const result = await this.pets.mutate(eq(pets.id, petId), (state) => ({
      state: { ...state, name },
      events: [],
      extra: state.name,
    }));
    await this.record(adminId, 'rename_pet', result.row.ownerId, result.extra ?? null, name);
    await this.activity.record(this.db, result.row.ownerId, 'name_changed', { what: 'pet', name });
  }

  async renamePlayer(adminId: string, playerId: string, name: string): Promise<void> {
    const [before] = await this.db.select().from(players).where(eq(players.id, playerId));
    if (!before) throw noPlayer();
    await this.db
      .update(players)
      .set({ displayName: name, nameLocked: true })
      .where(eq(players.id, playerId));
    await this.record(adminId, 'rename_player', playerId, before.displayName, name);
    await this.activity.record(this.db, playerId, 'name_changed', { what: 'player', name });
  }

  /** The Discord name comes back at the member's next sign-in. */
  async unlockPlayer(adminId: string, playerId: string): Promise<void> {
    const updated = await this.db
      .update(players)
      .set({ nameLocked: false })
      .where(and(eq(players.id, playerId), eq(players.nameLocked, true)))
      .returning({ name: players.displayName });
    if (updated.length === 0) throw noPlayer();
    await this.record(adminId, 'unlock_player_name', playerId, updated[0]!.name, null);
  }

  blockedWords(): Promise<string[]> {
    return this.filter.words();
  }

  async saveBlockedWords(adminId: string, words: string[]): Promise<string[]> {
    const before = await this.filter.words();
    const saved = await this.filter.save(words);
    await this.record(adminId, 'blocked_words', null, before.join(', '), saved.join(', '));
    return saved;
  }

  async log(): Promise<ModerationLogEntry[]> {
    const admin = aliasedTable(players, 'admin');
    const target = aliasedTable(players, 'target');
    const rows = await this.db
      .select({
        entry: moderationLog,
        adminName: admin.displayName,
        targetName: target.displayName,
      })
      .from(moderationLog)
      .leftJoin(admin, eq(admin.id, moderationLog.adminId))
      .leftJoin(target, eq(target.id, moderationLog.targetPlayerId))
      .orderBy(desc(moderationLog.createdAt))
      .limit(50);
    return rows.map(({ entry, adminName, targetName }) => ({
      id: entry.id,
      adminName: adminName ?? '',
      action: entry.action,
      targetName,
      before: entry.before,
      after: entry.after,
      createdAt: entry.createdAt.getTime(),
    }));
  }

  private async record(
    adminId: string,
    action: ModerationAction,
    targetPlayerId: string | null,
    before: string | null,
    after: string | null,
  ): Promise<void> {
    await this.db.insert(moderationLog).values({ adminId, action, targetPlayerId, before, after });
  }
}
