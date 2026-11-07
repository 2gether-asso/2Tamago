import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { conditions: ['@2tamago/source'] },
  test: {
    globals: true,
    include: ['test/**/*.e2e-spec.ts'],
    testTimeout: 20_000,
  },
});
