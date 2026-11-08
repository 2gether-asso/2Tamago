import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from 'drizzle-orm/pg-core';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import * as schema from './schema.js';

type Schema = typeof schema;

/** The database, whatever the driver (node-postgres or PGlite). */
export type Database = PgDatabase<PgQueryResultHKT, Schema>;
export type Transaction = PgTransaction<
  PgQueryResultHKT,
  Schema,
  ExtractTablesWithRelations<Schema>
>;
/** Something queries can run on: the database or an open transaction. */
export type Executor = Database | Transaction;

const MIGRATIONS = join(import.meta.dirname, '..', '..', 'drizzle');

/**
 * Opens the database from a URL and applies pending migrations (unless `migrate` is false, which
 * only applies to PostgreSQL: embedded databases live in the API process and always migrate):
 * - `postgres://…` real PostgreSQL (production),
 * - `pglite://<dir>` embedded PostgreSQL stored in a folder (development),
 * - `memory://` embedded PostgreSQL in memory (tests).
 */
export async function openDatabase(
  url: string,
  { migrate = true }: { migrate?: boolean } = {},
): Promise<Database> {
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
    const db = drizzlePg(url, { schema });
    if (migrate) await migratePg(db, { migrationsFolder: MIGRATIONS });
    return db as unknown as Database;
  }
  let client: PGlite;
  if (url === 'memory://') {
    client = new PGlite();
  } else if (url.startsWith('pglite://')) {
    const dir = url.slice('pglite://'.length);
    mkdirSync(dirname(dir), { recursive: true });
    client = new PGlite(dir);
  } else {
    throw new Error(`Unsupported DATABASE_URL: ${url}`);
  }
  const db = drizzlePglite({ client, schema });
  await migratePglite(db, { migrationsFolder: MIGRATIONS });
  return db as unknown as Database;
}
