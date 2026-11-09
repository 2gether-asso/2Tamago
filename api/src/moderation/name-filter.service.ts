import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { blockedTerm } from '@2tamago/core';
import { eq } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { gameSettings } from '../database/schema.js';

const KEY = 'blockedWords';

/** The words that cannot be in a companion's name: kept by admins, checked when a name is chosen. */
@Injectable()
export class NameFilterService {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  async words(): Promise<string[]> {
    const [row] = await this.db.select().from(gameSettings).where(eq(gameSettings.key, KEY));
    return Array.isArray(row?.value)
      ? (row.value as unknown[]).filter((word): word is string => typeof word === 'string')
      : [];
  }

  async save(words: string[]): Promise<string[]> {
    // Once, in the order given, without blanks: what the admin sees is what is checked.
    const clean = [...new Set(words.map((word) => word.trim()).filter(Boolean))];
    await this.db
      .insert(gameSettings)
      .values({ key: KEY, value: clean })
      .onConflictDoUpdate({
        target: gameSettings.key,
        set: { value: clean, updatedAt: new Date() },
      });
    return clean;
  }

  /** Throws a 400 with the code `name_not_allowed` when the name holds a blocked word. */
  async assertAllowed(name: string): Promise<void> {
    if (blockedTerm(name, await this.words())) {
      throw new BadRequestException({ statusCode: 400, code: 'name_not_allowed' });
    }
  }
}
