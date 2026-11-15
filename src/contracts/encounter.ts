/**
 * The player-visible side of an encounter: what the ship knows on arrival.
 * The full definition, including truth, is truth/encounter.ts.
 */

import type { Vec3 } from '../lib/vec3.ts';
import type { BelievedAsteroid, BelievedBody, ShipEstimate } from './belief.ts';
import type { ConfigurationId, EncounterId, ObjectId, ObjectiveId } from './ids.ts';
import type { ParameterPrior } from './model.ts';
import type { Meters, MetersPerSecond, Seconds } from './units.ts';

export type ObjectiveKind =
  'reach-region' | 'pass-gap' | 'rendezvous' | 'survey' | 'depart' | 'custom';

export interface Objective {
  readonly id: ObjectiveId;
  readonly kind: ObjectiveKind;
  /** Short instrument label, not prose. */
  readonly label: string;
  /** A sphere in the inertial frame. */
  readonly region?: { readonly center: Vec3; readonly radius: Meters };
  /** For moving targets (a gap, a rendezvous). */
  readonly target?: ObjectId;
  /** Sim-time window in which it counts. */
  readonly window?: { readonly from: Seconds; readonly to: Seconds };
  /**
   * A distance band (a spherical shell) about `target` (or `region.center`), e.g. an orbit
   * between two radii.
   */
  readonly band?: { readonly inner: Meters; readonly outer: Meters };
  /**
   * `depart`: leave the encounter, measured as speed relative to its centre of mass once the
   * ship is `beyond` that distance from it in any direction (for example a slingshot exit, A6).
   */
  readonly depart?: {
    readonly beyond: Meters;
    readonly minSpeed: MetersPerSecond;
    /**
     * A real gravity assist must come first (A18 (3)): a visit inside `within` of `body` that
     * gave the ship at least `minGain` of specific energy from the body's motion, m²/s².
     */
    readonly assist?: { readonly body: ObjectId; readonly within: Meters; readonly minGain: number };
    /**
     * Burns spent while the ship cannot yet leave the primary's lobe (dives, a low orbit) do
     * not count against `maxDeltaV` (A18 (3)).
     */
    readonly learningFree?: boolean;
  };
  /** Most propellant the objective allows, as commanded Δv. */
  readonly maxDeltaV?: MetersPerSecond;
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
  /**
   * Shared reference radius r₀ of the gravity law (P4): the convention the briefing's GM values
   * use, not something the model has to discover.
   */
  readonly referenceRadius?: Meters;
}
