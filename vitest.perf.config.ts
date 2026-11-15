import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

// The simulation speed test runs on its own, after the main suite (`npm test`). Inside the
// parallel suite every core is busy and the wall-clock bound flakes (101–107 ms against
// 100 ms); alone it takes about 27 ms, so the bound still catches a real slowdown.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['src/sim/performance.test.ts'],
      environment: 'node',
    },
  }),
);
