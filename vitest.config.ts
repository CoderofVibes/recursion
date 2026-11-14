import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig, { IGNORED_DIRS } from './vite.config.ts';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/**/*.test.ts'],
      exclude: ['**/node_modules/**', '**/dist/**', ...IGNORED_DIRS.map((dir) => `${dir}/**`)],
      environment: 'node',
    },
  }),
);
