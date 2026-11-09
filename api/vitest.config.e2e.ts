import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { conditions: ['@2tamago/source'] },
  test: {
    globals: true,
    include: ['test/**/*.e2e-spec.ts'],
    testTimeout: 20_000,
    // Each test boots a fresh database and runs every migration; with files in parallel on a busy
    // machine that can exceed Vitest's default 10 s.
    hookTimeout: 60_000,
  },
});
