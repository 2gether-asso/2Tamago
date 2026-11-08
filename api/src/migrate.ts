import { AppConfig } from './config/app-config.js';
import { openDatabase } from './database/database.js';

/**
 * Applies the pending migrations and exits. Run it as a deployment step, before starting the API
 * with `DATABASE_AUTO_MIGRATE=false` (`node dist/migrate.js`).
 */
const config = new AppConfig();
if (!config.databaseUrl.startsWith('postgres')) {
  throw new Error('Separate migrations only make sense with a PostgreSQL DATABASE_URL');
}
await openDatabase(config.databaseUrl);
console.log('Migrations applied');
process.exit(0);
