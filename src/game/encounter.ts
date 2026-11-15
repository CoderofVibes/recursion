/**
 * What the game loop needs from an encounter beyond the shared `EncounterDefinition`.
 * TRUTH side: holds the definition (with the true world) and truth-evaluated objective rules.
 * Content sections build one of these under src/content/<encounter>/.
 */

import type { Command } from '../contracts/commands.ts';
import type { BodyId, ObjectiveId, TankId } from '../contracts/ids.ts';
import type { EncounterDefinition } from '../contracts/truth/index.ts';
import type {
  Hertz,
  Kilograms,
  Meters,
  MetersPerSecond,
  Radians,
  Seconds,
} from '../contracts/units.ts';

/**
 * How the world decides an objective. Evaluated on truth each tick (the world does not care
 * what the ship believes); the ship learns the result as a `ShipEvent` `objective`.
 */
export type ObjectiveRule =
  /**
   * Stay between `inner` and `outer` from a body's centre (a spherical shell) while sweeping
   * `revolutions` full turns about it, in whatever plane the orbit lies. Turning back undoes
   * what was swept; leaving the band starts the count again. Reaching it completes the attempt.
   */
  | {
      readonly kind: 'orbit-band';
      readonly objective: ObjectiveId;
      readonly body: BodyId;
      readonly inner: Meters;
      readonly outer: Meters;
      readonly revolutions: number;
    }
  /**
   * Leave the encounter (A6): judged the first time the ship is farther than `beyond` from the
   * massive bodies' barycentre, in any direction. Reached, completing the attempt, if its speed
   * relative to that barycentre is at least `minSpeed` and, when `maxDeltaV` is given, it has
   * spent no more than that (the time integral of net thrust over mass: main engine and RCS
   * translation; balanced attitude couples add nothing). Otherwise missed, once; the attempt
   * goes on.
   */
  | {
      readonly kind: 'depart';
      readonly objective: ObjectiveId;
      readonly beyond: Meters;
      readonly minSpeed: MetersPerSecond;
      readonly maxDeltaV?: MetersPerSecond;
    }
  /** Judged at completion: reached if the tank still holds at least `minimum`. */
  | {
      readonly kind: 'reserve';
      readonly objective: ObjectiveId;
      readonly tank: TankId;
      readonly minimum: Kilograms;
    };

/** Every tunable the loop uses. All [ASSUMED] play values; listed in the 2F handoff. */
export interface PlayValues {
  /** Time-warp choices offered, sim seconds per real second. Warp never changes `dt`. */
  readonly warpSteps: readonly number[];
  /** Hull contact at or above this relative speed loses the ship. */
  readonly lossSpeed: MetersPerSecond;
  /** A target closer than this to the sun's direction is lost in glare. */
  readonly sunExclusionAngle: Radians;
  /** Believed position is added to the measured trail this often. */
  readonly trailInterval: Seconds;
  /** Telemetry is recorded when a channel moves by more than this fraction, or at the keepalive. */
  readonly telemetryDeadband: number;
  readonly telemetryKeepalive: Seconds;
  /** Black Box rate set by the arrival procedure. */
  readonly recorderRate: Hertz;
  /** Longest forecast requested when a plan is committed. */
  readonly forecastSpan: Seconds;
  /**
   * The smallest asteroid the unaided eye makes out through the window: half the angle it
   * spans from the ship. Smaller ones are left out of `ViewSnapshot.window`. Bodies always show.
   */
  readonly windowMinAngularRadius: Radians;
}

export interface EncounterSetup {
  readonly definition: EncounterDefinition;
  /**
   * Arrival procedure: commands the ship executes at t = 0 of every attempt (recorded with
   * source `procedure`), so the believed side knows how the ship is set up without reading truth.
   */
  readonly arrivalCommands: readonly Command[];
  /**
   * The ship's mass on arrival as the crew knows it from the loading record, kg. The model
   * uses it until the first tank gauges are recorded.
   */
  readonly arrivalMass: Kilograms;
  readonly objectiveRules: readonly ObjectiveRule[];
  readonly play: PlayValues;
}

export const DEFAULT_PLAY: PlayValues = {
  warpSteps: [1, 10, 60, 300, 1000, 2000],
  lossSpeed: 3,
  sunExclusionAngle: (20 * Math.PI) / 180,
  trailInterval: 60,
  telemetryDeadband: 0.002,
  telemetryKeepalive: 600,
  recorderRate: 0.05,
  forecastSpan: 16 * 3600,
  windowMinAngularRadius: 2e-4,
};
