import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['__tests__/**/*.integration.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    sequence: {
      concurrent: false,
    },
  },
});
