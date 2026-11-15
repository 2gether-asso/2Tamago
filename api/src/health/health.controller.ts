import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { sql } from 'drizzle-orm';
import { Public } from '../auth/session.js';
import type { Database } from '../database/database.js';

/** Longest wait for the database before the API reports itself unavailable. */
const DATABASE_TIMEOUT_MS = 3000;

@Public()
@Controller('health')
export class HealthController {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  @Get()
  async check() {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('database timeout')), DATABASE_TIMEOUT_MS);
    });
    try {
      await Promise.race([this.db.execute(sql`select 1`), timeout]);
    } catch {
      // An unreachable database is an expected outcome of this probe, not a bug: answer 503
      // (not reported as an error) so the orchestrator can react.
      throw new ServiceUnavailableException({ status: 'unavailable' });
    } finally {
      clearTimeout(timer);
    }
    return { status: 'ok' };
  }
}
