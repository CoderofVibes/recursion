import { makeLatticeView } from './LatticeView.ts';

// Dynamic import breaks the eager-glob cycle, including Vitest's asynchronous transform.
// A microtask alone can still run before the registry's module body initializes.
void import('../../fieldViews.ts').then(({ registerFieldView }) => {
  registerFieldView('lattice', makeLatticeView);
});
export { makeLatticeView } from './LatticeView.ts';
export { readLatticeVisual } from './data.ts';
export type { LatticeVisual, LatticeStrand, LatticeCoverage, LatticeThreat } from './data.ts';
