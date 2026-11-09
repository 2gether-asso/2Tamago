import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { conditions: ['@2tamago/source'] },
  test: {
    globals: true,
    include: ['test/**/*.e2e-spec.ts'],
    // Each test boots a fresh database and runs every migration; with the files in parallel on a
    // busy machine a few seconds become tens of seconds.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
