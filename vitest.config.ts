import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
    globalSetup: ['./tests/globalSetup.ts'],
    maxWorkers: 4,
  },
});
