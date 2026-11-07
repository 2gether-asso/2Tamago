import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { conditions: ['@2tamago/source'] },
  test: {
    globals: true,
    include: ['src/**/*.spec.ts'],
  },
});
