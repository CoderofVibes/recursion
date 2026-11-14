/**
 * TRUTH. A complete encounter: the player-visible briefing plus the true world at arrival.
 * Content sections author these under src/content/<encounter>/.
 */

import type { EncounterBriefing } from '../encounter.ts';
import type { ShipDefinition } from '../ship.ts';
import type { Seconds } from '../units.ts';
import type { TruthWorld } from './world.ts';

export interface EncounterDefinition {
  readonly briefing: EncounterBriefing;
  readonly ship: ShipDefinition;
  /** True world at arrival (t = 0). Recurrence resets to exactly this (P8). */
  readonly world: TruthWorld;
  /** Root seed for every noise stream in the encounter. */
  readonly seed: string;
  /** Simulation step size. */
  readonly dt: Seconds;
}
