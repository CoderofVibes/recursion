/**
 * Simulation API types (owned by 2A). Truth side: only src/game, src/content and src/ship may
 * import src/sim (P11). Everything here is plain JSON data except `Simulation` itself.
 */

import type { ObjectId } from '../contracts/ids.ts';
import type {
  ActuatorOutput,
  EnvironmentField,
  FieldRegistry,
  ShipSystemsState,
  SimEvent,
  TruthWorld,
} from '../contracts/truth/index.ts';
import type { Meters, MetersPerSecond, NewtonSeconds, Seconds } from '../contracts/units.ts';
import type { Vec3 } from '../lib/vec3.ts';

export interface SimOptions {
  /** Fixed step, s (the encounter's `dt`). Warp changes how many steps run, never this. */
  readonly dt: Seconds;
  /** Factories for `world.fields`. Required when the world has fields. */
  readonly registry?: FieldRegistry;
  /** Coefficient of restitution for hull contacts, 0..1. Default 0.2 [ASSUMED]. */
  readonly restitution?: number;
  /**
   * Objects whose surface is farther than this beyond the hull's reach (m) have their clearance
   * measured from the ship's centre of mass instead of the hull's prisms (cheaper; the error is
   * at most the hull's size). Default 5000.
   */
  readonly hullClearanceRange?: Meters;
}

/** What one step needs from the rest of the game. */
export interface SimInput {
  /** This step's actuator output from ship systems. Omit to coast (no thrust, no torque). */
  readonly actuators?: ActuatorOutput;
  /**
   * Ship-systems state to store in the new world (the one the ship-systems step just returned).
   * Omit to carry the previous one over.
   */
  readonly systems?: ShipSystemsState;
}

/** A clearance minimum still forming: the clearance was falling at the end of the last step. */
export interface ClearanceSample {
  readonly t: Seconds;
  readonly distance: Meters;
}

/** Everything the simulation carries from step to step. Plain data; save and restore freely. */
export interface SimState {
  readonly world: TruthWorld;
  /** Whole steps since the simulation's start; world.t = t0 + tick × dt (no float drift). */
  readonly tick: number;
  /**
   * Non-gravitational acceleration over the last step at the centre of mass, body frame (all
   * three axes), m/s²: thrust after any field modified it, plus contact impulses. Feeds
   * EnvironmentEffects.specificForce for the next ship-systems step (what accelerometers sense).
   */
  readonly specificForce: Vec3;
  /** Objects the hull is touching. */
  readonly contacts: readonly ObjectId[];
  /** Clearance minima still forming, by object. */
  readonly closing: Readonly<Record<ObjectId, ClearanceSample>>;
}

/** Detail of a hull contact, for the game layer's ShipEvent 'contact'. */
export interface ContactDetail {
  readonly t: Seconds;
  readonly with: ObjectId;
  /** Impulse magnitude on the ship, N·s (0 if it was already separating). */
  readonly impulse: NewtonSeconds;
  /** Contact point on the hull surface (a side wall, a cap, an edge or a corner), body frame. */
  readonly point: Vec3;
  /** Unit normal from the hull toward the object's centre, body frame. */
  readonly normal: Vec3;
  /** Speed of the hull point relative to the object at contact, m/s. */
  readonly relativeSpeed: MetersPerSecond;
  /** True for a new impact (also reported as a SimEvent), false for continued pushing. */
  readonly impact: boolean;
}

/** An asteroid that reached a massive body's surface; it leaves the world. */
export interface AsteroidAbsorbed {
  readonly t: Seconds;
  readonly asteroid: ObjectId;
  readonly body: ObjectId;
}

export interface StepResult {
  readonly state: SimState;
  /** In time order. */
  readonly events: readonly SimEvent[];
  readonly contacts: readonly ContactDetail[];
  readonly absorbed: readonly AsteroidAbsorbed[];
  /** Smallest clearance to any object during this step, or null if there are no objects. */
  readonly minClearance: { readonly with: ObjectId; readonly distance: Meters } | null;
}

export interface RunOptions {
  /** Input for each step, by tick (whole steps since start) and the step's start time. */
  readonly input?: (tick: number, t: Seconds) => SimInput | undefined;
  /** Call `onSample` every this many steps (and after the last). Default: only after the last. */
  readonly sampleEvery?: number;
  readonly onSample?: (state: SimState) => void;
  /** Stop after the first step with a new impact. */
  readonly stopOnImpact?: boolean;
}

export interface RunResult {
  readonly state: SimState;
  /** Steps actually run. */
  readonly steps: number;
  readonly events: readonly SimEvent[];
  readonly contacts: readonly ContactDetail[];
  readonly absorbed: readonly AsteroidAbsorbed[];
}

export interface Simulation {
  readonly dt: Seconds;
  /** Sim time at tick 0 (the starting world's t). */
  readonly t0: Seconds;
  /** Fields instantiated from the starting world's specs, in spec order. */
  readonly fields: readonly EnvironmentField[];
  /** The starting state. Recurrence restarts from exactly this (P8). */
  readonly initial: SimState;
  /** One fixed step. Pure: the same state and input always give the same result. */
  step(state: SimState, input?: SimInput): StepResult;
  /**
   * Many steps without building a world object per step (bulk propagation, forecasting, tests).
   * Bit-identical to calling `step` the same number of times with the same inputs.
   */
  run(state: SimState, steps: number, options?: RunOptions): RunResult;
}
