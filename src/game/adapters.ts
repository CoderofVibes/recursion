/**
 * TRUTH side. Each field encounter's wiring into the truth tick, by encounter id: the hooks
 * its setup needs (`EncounterSetup.environment`, `.dynamics`, `.hazards`) built from its own
 * section's functions. The truth step applies it to whatever setup it is given, so the
 * registered entries stay exactly as their sections made them.
 */

import type { ChainLinkSetup } from '../content/chain-link/index.ts';
import type { InverseWellsSetup } from '../content/inverse-wells/index.ts';
import type { EncounterSetup } from './encounter.ts';
import { withFunnels } from './funnels.ts';
import { withLatticeEnvironment } from './lattice.ts';

/** The setup with its encounter's hooks, unless it has them already. */
export function adaptSetup(setup: EncounterSetup): EncounterSetup {
  switch (setup.definition.briefing.id) {
    case 'inverse-wells':
      return setup.dynamics ? setup : withFunnels(setup as InverseWellsSetup);
    case 'chain-link':
      return setup.environment ? setup : withLatticeEnvironment(setup as ChainLinkSetup);
    default:
      return setup;
  }
}
