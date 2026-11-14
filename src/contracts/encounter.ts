/**
 * The player-visible side of an encounter: what the ship knows on arrival.
 * The full definition, including truth, is truth/encounter.ts.
 */

import type { Vec2 } from '../lib/vec2.ts';
import type { BelievedAsteroid, BelievedBody, ShipEstimate } from './belief.ts';
import type { ConfigurationId, EncounterId, ObjectId, ObjectiveId } from './ids.ts';
import type { ParameterPrior } from './model.ts';
import type { Meters, Seconds } from './units.ts';

export type ObjectiveKind = 'reach-region' | 'pass-gap' | 'rendezvous' | 'survey' | 'custom';

export interface Objective {
  readonly id: ObjectiveId;
  readonly kind: ObjectiveKind;
  /** Short instrument label, not prose. */
  readonly label: string;
  readonly region?: { readonly center: Vec2; readonly radius: Meters };
  /** For moving targets (a gap, a rendezvous). */
  readonly target?: ObjectId;
  /** Sim-time window in which it counts. */
  readonly window?: { readonly from: Seconds; readonly to: Seconds };
}

export interface EncounterBriefing {
  readonly id: EncounterId;
  readonly name: string;
  readonly objectives: readonly Objective[];
  /** Navigation estimate on arrival. */
  readonly arrivalEstimate: ShipEstimate;
  readonly arrivalConfiguration: ConfigurationId;
  /** Model priors on arrival: known physics and nominal ratings. */
  readonly priors: readonly ParameterPrior[];
  /** Objects visible on arrival, as believed. */
  readonly knownBodies: readonly BelievedBody[];
  readonly knownAsteroids: readonly BelievedAsteroid[];
}
