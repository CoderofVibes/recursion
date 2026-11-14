/**
 * TRUTH. The ship's real physical and systems state, and the ship-systems step contract.
 *
 * One simulation tick (the game layer runs it):
 *   1. Game builds EnvironmentEffects from the truth world (sensor scene, lattice intensity, last step's
 *      non-gravitational acceleration).
 *   2. Ship systems: step(state, config, commands, envEffects, dt)
 *        → { state, actuators, measurements, events }
 *   3. Simulation integrates the world with the actuators (fields may modify thrust).
 * Measurements and events go to the model and Black Box; truth never does.
 */

import type { Quat } from '../../lib/quat.ts';
import type { RngState } from '../../lib/rng.ts';
import type { Vec3 } from '../../lib/vec3.ts';
import type { AttitudeTarget, Command } from '../commands.ts';
import type {
  ConfigurationId,
  EquipmentId,
  FieldId,
  ObjectId,
  TankId,
  ThermalNodeId,
} from '../ids.ts';
import type { Measurement, ShipEvent } from '../measurements.ts';
import type { MassProperties, ShipDefinition } from '../ship.ts';
import type {
  Bytes,
  Fraction,
  Hertz,
  JsonValue,
  Kelvin,
  Kilograms,
  LatticeExposure,
  LatticeIntensity,
  Meters,
  Seconds,
  Watts,
  WattsPerMeter2,
} from '../units.ts';

/** Rigid-body state in three dimensions (A11). Integrated by the simulation. */
export interface ShipKinematics {
  /** Centre of mass, inertial. */
  readonly position: Vec3;
  readonly velocity: Vec3;
  /** Unit quaternion, body to inertial. */
  readonly attitude: Quat;
  /** Angular velocity, body frame, rad/s. */
  readonly angularVelocity: Vec3;
}

export interface EquipmentState {
  readonly id: EquipmentId;
  readonly mode: string;
  readonly allocation: Watts;
  readonly powerDraw: Watts;
  /** Permanent condition: 0 failed to 1 nominal. */
  readonly condition: Fraction;
  /** Protection has tripped (resettable, unlike condition). */
  readonly tripped: boolean;
  readonly temperature?: Kelvin;
  readonly faults: readonly string[];
  /** Equipment-specific state, SI, e.g. { charge: 1.2e8 } for a battery. */
  readonly values: Readonly<Record<string, number>>;
}

export interface ActiveBurn {
  readonly thruster: EquipmentId;
  readonly throttle: Fraction;
  readonly until: Seconds;
}

/** Everything the ship-systems step owns. Plain data, JSON-serialisable. */
export interface ShipSystemsState {
  readonly t: Seconds;
  readonly configuration: ConfigurationId;
  /** Present while moving between configurations. */
  readonly transition?: { readonly to: ConfigurationId; readonly completesAt: Seconds };
  readonly equipment: Readonly<Record<EquipmentId, EquipmentState>>;
  /** Propellant mass per tank. */
  readonly tanks: Readonly<Record<TankId, Kilograms>>;
  /** Temperature per thermal node. */
  readonly thermal: Readonly<Record<ThermalNodeId, Kelvin>>;
  readonly recorder: {
    readonly sampleRate: Hertz;
    readonly bytesUsed: Bytes;
    readonly capacity: Bytes;
  };
  /** Accumulated lattice exposure per equipment item (Chain Link Fence, Phase 3). */
  readonly exposure: Readonly<Record<EquipmentId, LatticeExposure>>;
  readonly attitudeTarget: AttitudeTarget;
  readonly burns: readonly ActiveBurn[];
  /**
   * Derived each step from configuration (interpolated during transitions) and consumables.
   * The single authoritative geometry for inertia, cooling and clearance (hull).
   */
  readonly massProperties: MassProperties;
  /**
   * Seeded noise streams, one per noise source (e.g. "sensors.optical"). Initialise from
   * createRng(seed).stream(name).getState(); restore with setState() each step. Keeping them
   * in state makes the step a pure function and replays exact (P2, P9).
   */
  readonly rng: Readonly<Record<string, RngState>>;
  /** Subsystem-private extras the ship-systems section needs; keep JSON. */
  readonly ext?: Readonly<Record<string, JsonValue>>;
}

export interface ShipTruth {
  readonly kinematics: ShipKinematics;
  readonly systems: ShipSystemsState;
}

export interface ThrustOutput {
  readonly source: EquipmentId;
  /** Application point, body frame. */
  readonly point: Vec3;
  /** Force on the ship, body frame (misalignment and scale errors already applied). */
  readonly force: Vec3;
}

/** What ship systems hand the simulation for this step. */
export interface ActuatorOutput {
  readonly thrusts: readonly ThrustOutput[];
  /** Pure torque (reaction wheels), body frame, N·m. */
  readonly torque: Vec3;
  readonly massProperties: MassProperties;
}

/** An object as the sensor hardware could see it this step (truth geometry). */
export interface SensorTarget {
  readonly id: ObjectId;
  readonly kind: 'body' | 'asteroid';
  /** Target centre minus ship centre of mass, inertial. */
  readonly relativePosition: Vec3;
  readonly relativeVelocity: Vec3;
  readonly radius: Meters;
}

/** What the environment does to ship systems this step. Built by the game layer from truth. */
export interface EnvironmentEffects {
  readonly t: Seconds;
  readonly kinematics: ShipKinematics;
  /**
   * Non-gravitational acceleration actually experienced over the previous step, body frame,
   * after any field modified the thrust. This is what accelerometers sense.
   */
  readonly specificForce: Vec3;
  readonly targets: readonly SensorTarget[];
  /** Lattice intensity over each equipment item's occupied geometry (sampled by the game layer). */
  readonly intensity: Readonly<Record<EquipmentId, LatticeIntensity>>;
  /** Raw field signals available to sensor processing modes, keyed by field. */
  readonly fieldSignals: Readonly<Record<FieldId, JsonValue>>;
  /**
   * Sunlight at the ship (DECISIONS A3): inertial unit direction toward the sun, and irradiance
   * after shadowing by massive bodies (0 in full shadow, or when the encounter has no sun).
   * Solar output and absorbed radiator heat use this; 1C's formulas are in data/ship-baseline.json.
   */
  readonly sunlight: { readonly direction: Vec3; readonly irradiance: WattsPerMeter2 };
}

export interface ShipStepResult {
  readonly state: ShipSystemsState;
  readonly actuators: ActuatorOutput;
  readonly measurements: readonly Measurement[];
  readonly events: readonly ShipEvent[];
}

/**
 * The ship-systems step (2B implements). Pure: same inputs give the same result.
 * `config` is the static design (ShipDefinition); the current configuration is in state.
 * `commands` are those that take effect this step.
 */
export type ShipSystemsStep = (
  state: ShipSystemsState,
  config: ShipDefinition,
  commands: readonly Command[],
  envEffects: EnvironmentEffects,
  dt: Seconds,
) => ShipStepResult;
