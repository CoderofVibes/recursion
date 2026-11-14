import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Folders that live inside the project but must never be compiled, scanned or watched
// by the main checkout: worker-thread worktrees, Claude Code state, research copies,
// standalone visual prototypes and offline tools.
export const IGNORED_DIRS = ['.worktrees', '.claude', 'References', 'prototypes', 'tools'];

// Anchored to this checkout's own folder. A `**/.worktrees/**` glob would also match every path
// of a dev server started inside a worktree, which then never saw its own edits (2F).
const ROOT = fileURLToPath(new URL('.', import.meta.url)).replace(/\\/g, '/');
const IGNORED_ROOTS = IGNORED_DIRS.map((dir) => `${ROOT.replace(/\/$/, '')}/${dir}`);
const isIgnored = (path: string): boolean => {
  const p = path.replace(/\\/g, '/');
  return IGNORED_ROOTS.some((d) => p === d || p.startsWith(`${d}/`));
};

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
      ignored: isIgnored,
    },
  },
  optimizeDeps: {
    // Only crawl the app entry and the UI lab (dev-only page owned by the UI lane, 1E);
    // otherwise Vite scans every .html file it finds, including worker worktrees and prototypes.
    entries: ['index.html', 'src/theme/lab/*.html'],
  },
  worker: {
    format: 'es',
  },
});
