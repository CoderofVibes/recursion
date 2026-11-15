import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tools/harness/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 120_000,
  },
});
