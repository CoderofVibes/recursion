import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Truth/belief boundary (DECISIONS P11).
 *
 * The ship's believed world, its records and everything the player sees must be built only
 * from what the ship measured or assumed. These folders may not import the truth simulation
 * (`src/sim/`), truth contracts (`src/contracts/truth/`) or truth fixtures.
 * The game layer (`src/game/`) is the only place that holds both sides and builds what the
 * console and 3D view receive.
 */
export const BELIEF_SIDE = [
  'src/model/**',
  'src/blackbox/**',
  'src/console/**',
  'src/view3d/**',
  'src/theme/**',
];

export const TRUTH_IMPORT_PATTERNS = [
  {
    regex: '(^|/)sim(/|$)',
    message:
      'Truth/belief boundary (P11): belief-side code may not import the truth simulation. Use measurements, src/contracts and src/lib.',
  },
  {
    regex: '(^|/)contracts/truth(/|$)',
    message:
      'Truth/belief boundary (P11): belief-side code may not import truth contracts. Import from src/contracts (index) instead.',
  },
  {
    regex: '(^|/)fixtures/(truth|generate)(\\.ts)?$',
    message:
      'Truth/belief boundary (P11): belief-side code may not import truth fixtures. Use src/contracts/fixtures (index).',
  },
];

export default defineConfig([
  globalIgnores([
    'dist/',
    'coverage/',
    'node_modules/',
    '.worktrees/',
    '.claude/',
    'References/',
    'prototypes/',
    'tools/',
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.worker },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['*.config.{js,ts}', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    // Evidence scripts committed with docs (for example docs/engineering/) run in Node.
    files: ['docs/**/*.{js,mjs}'],
    languageOptions: { globals: globals.node },
  },
  {
    files: BELIEF_SIDE,
    rules: {
      'no-restricted-imports': ['error', { patterns: TRUTH_IMPORT_PATTERNS }],
    },
  },
]);
