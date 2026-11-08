import { Controller, Get } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { sql } from 'drizzle-orm';
import { Public } from '../auth/session.js';
import type { Database } from '../database/database.js';

@Public()
@Controller('health')
export class HealthController {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  @Get()
  async check() {
    await this.db.execute(sql`select 1`);
    return { status: 'ok' };
  }
}
