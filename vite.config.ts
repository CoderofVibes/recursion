import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Folders that live inside the project but must never be compiled, scanned or watched
// by the main checkout: worker-thread worktrees, Claude Code state, research copies,
// standalone visual prototypes and offline tools.
export const IGNORED_DIRS = ['.worktrees', '.claude', 'References', 'prototypes', 'tools'];

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the build works from any static host or sub-path.
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    watch: {
      ignored: IGNORED_DIRS.map((dir) => `**/${dir}/**`),
    },
  },
  optimizeDeps: {
    // Only crawl the app entry; otherwise Vite scans every .html file it finds,
    // including those inside worker worktrees and visual prototypes.
    entries: ['index.html'],
  },
  worker: {
    format: 'es',
  },
});
