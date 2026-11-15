/**
 * What the game loop needs from an encounter beyond the shared `EncounterDefinition`.
 * TRUTH side: holds the definition (with the true world) and truth-evaluated objective rules.
 * Content sections build one of these under src/content/<encounter>/.
 */

import type { Command } from '../contracts/commands.ts';
import type { EnvironmentEffects, FieldRegistry } from '../contracts/truth/index.ts';
import type { SimState } from '../sim/index.ts';
import type { Vec3 } from '../lib/vec3.ts';
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
   * Leave the encounter (A6, A18 (3)): judged when the ship crosses outward past `beyond` from
   * the massive bodies' barycentre, in any direction (or at once, if it starts out there).
   * Reached, completing the attempt, when all of these hold; otherwise missed, once, and the
   * attempt goes on:
   * - it is moving away from the barycentre at `minSpeed` or more;
   * - when `maxDeltaV` is given, it has spent no more than that (the time integral of net
   *   thrust over mass: main engine and RCS translation; balanced attitude couples add
   *   nothing). With `learningFree`, thrust spent while the ship could not leave the primary's
   *   lobe (its Jacobi constant above the value at the neck between the first two bodies,
   *   `jacobi.ts`) does not count: science burns and a low orbit are free;
   * - when `assist` is given, a real gravity assist came first: a visit inside `within` of
   *   `body` from which the ship came out with at least `minGain` of specific energy that the
   *   body's motion gave it (∫ v_body · a_body dt over the visit, S8). A fast arrival that
   *   never swings round the body cannot meet it.
   */
  | {
      readonly kind: 'depart';
      readonly objective: ObjectiveId;
      readonly beyond: Meters;
      readonly minSpeed: MetersPerSecond;
      readonly maxDeltaV?: MetersPerSecond;
      readonly learningFree?: boolean;
      readonly assist?: {
        readonly body: BodyId;
        readonly within: Meters;
        /** m²/s². */
        readonly minGain: number;
      };
    }
  /**
   * Reach a place (3B's and 3C's exits): the ship's centre of mass inside a sphere of `radius`
   * about `center`, an inertial point or a point carried with a body, below `maxSpeed` relative
   * to that centre when one is given, and inside `window` when one is given. The first
   * objective reached completes the attempt and its outcome names it, so an encounter with two
   * exits gives each its own objective. Missed, once, when the window closes unreached.
   */
  | {
      readonly kind: 'reach-region';
      readonly objective: ObjectiveId;
      readonly center: Vec3 | { readonly body: BodyId; readonly offset?: Vec3 };
      readonly radius: Meters;
      readonly maxSpeed?: MetersPerSecond;
      readonly window?: { readonly from: Seconds; readonly to: Seconds };
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
  /**
   * Power (A18 (5), after S21): a caution when the gauges' no-generation endurance (stored
   * energy over the present demand, as if the arrays gave nothing) falls below `cautionLead`;
   * loss when a critical function has gone `lossGrace` without the power it needs (`power.ts`).
   * The gauges are read every `checkEvery` of ship time, and at once when the ship reports a
   * power fault.
   */
  readonly power: {
    readonly cautionLead: Seconds;
    readonly lossGrace: Seconds;
    readonly checkEvery: Seconds;
  };
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
  /**
   * Factories for the world's environment fields (`world.fields`), for encounters that have
   * any (Inverse Wells, the lattice). The truth step passes it to the simulation.
   */
  readonly fields?: FieldRegistry;
  /**
   * For fields that need more than the game's point sampling (3C's lattice sweeps each item's
   * whole occupied geometry): given the state at the start of the tick and the effects the game
   * built, return the effects the ship receives. Pure; called once per tick before the ship
   * systems step.
   */
  readonly environment?: (state: SimState, effects: EnvironmentEffects) => EnvironmentEffects;
}

/**
 * Where the loop gets its encounter: one setup for every attempt, or one per run (A10: each
 * run's starting geometry and sensor noise come from its own seed). `run` counts from 0 over
 * the whole save, so a restored save goes on with new geometry rather than repeating it. The
 * ship and the play values must not change between runs.
 */
export type EncounterSource = EncounterSetup | ((run: number) => EncounterSetup);

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
  // S21, approved by the owner (A18 (5)): the caution four hours ahead, the loss after 120 s.
  power: { cautionLead: 4 * 3600, lossGrace: 120, checkEvery: 60 },
};
