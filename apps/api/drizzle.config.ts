import { defineConfig } from 'drizzle-kit';

// Only used to generate SQL migrations from the schema (`pnpm db:generate`).
// The API applies them itself at startup.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/database/schema.ts',
  out: './drizzle',
});
