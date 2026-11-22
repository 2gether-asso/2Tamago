import { vi } from 'vitest';

// The daily missions are picked from the (random) player id: a mission completed by chance would
// pay coins that the exact amounts of other tests do not expect. No missions, unless a test file
// pins its own (see missions.e2e-spec.ts).
vi.mock('@2tamago/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@2tamago/core')>()),
  pickMissions: () => [],
}));
