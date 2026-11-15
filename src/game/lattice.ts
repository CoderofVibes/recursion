/**
 * TRUTH side. 3C's Chain Link Fence in the truth tick (3C's R20, item 2): the lattice's own
 * environment (`createChainLinkEnvironment(setup).at(state)`) built at every tick's start, the
 * actual acquisition state, and its truth-only scene handed to the ship's sensors beside the
 * game's own environment. The lattice's intensity reaches each equipment item through the
 * game's field sampling, and its harm through 3A's conditioned ship step, every 0.1 s tick.
 */

import type { ChainLinkSetup } from '../content/chain-link/index.ts';
import { createChainLinkEnvironment } from '../content/chain-link/environment.ts';
import type { EncounterSetup } from './encounter.ts';

export function withLatticeEnvironment(setup: ChainLinkSetup): EncounterSetup {
  const lattice = createChainLinkEnvironment(setup);
  return {
    ...setup,
    environment: (state, effects) => {
      const own = lattice.at(state);
      return { ...effects, fieldSignals: { ...effects.fieldSignals, ...own.fieldSignals } };
    },
  };
}
