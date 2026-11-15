import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig, { IGNORED_DIRS } from './vite.config.ts';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/**/*.test.ts'],
      // The speed test runs alone after the suite (vitest.perf.config.ts), not under its load.
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        ...IGNORED_DIRS.map((dir) => `${dir}/**`),
        'src/sim/performance.test.ts',
      ],
      environment: 'node',
      // The suite is large and runs alongside other threads' work, so heavy flights pass 5 s under
      // load (each passes alone). A per-test time limit, not a tolerance; the speed test keeps its
      // own 100 ms bound and runs alone (vitest.perf.config.ts).
      testTimeout: 30_000,
    },
  }),
);
