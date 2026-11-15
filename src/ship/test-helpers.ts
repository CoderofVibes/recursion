/**
 * Test support for the ship in three dimensions. Not used by the game.
 *
 * The ship step only asks for forces; something has to turn them into motion. The simulation
 * does that in the game. These helpers do it for the ship's own tests with the simplest scheme
 * that is good enough to close the attitude loop, so the tests do not depend on `src/sim`:
 *
 *   torque = Σ (point − centre of mass) × force + pure torque          (about the centre of mass)
 *   ω ← ω + I⁻¹ (torque − ω × I ω) · dt                                 (body frame)
 *   q ← q ⊗ exp(½ ω dt)                                                 (with the new ω)
 *
 * that is, semi-implicit (symplectic) Euler on Euler's equations, first order in dt. The linear
 * motion of the centre of mass is integrated the same way when asked for. At the rates the
 * controller uses (below 0.01 rad/s) and dt ≤ 1 s the scheme's error is far below the
 * controller's deadbands.
 */

import type { Command } from '../contracts/commands.ts';
import type { ShipDefinition } from '../contracts/ship.ts';
import type {
  EnvironmentEffects,
  SensorTarget,
  ShipKinematics,
  ShipStepResult,
  ShipSystemsState,
} from '../contracts/truth/ship.ts';
import { IDENTITY, integrateBodyRate, rotate, type Quat } from '../lib/quat.ts';
import type { Sym3 } from '../lib/sym3.ts';
import { add, cross, scale, sub, ZERO, type Vec3 } from '../lib/vec3.ts';
import { inertiaTensor } from './massprops/massprops.ts';
import { createShipSystemsState, stepShipSystems } from './index.ts';

export const RESTING: ShipKinematics = {
  position: ZERO,
  velocity: ZERO,
  attitude: IDENTITY,
  angularVelocity: ZERO,
};

/** An empty, dark scene around the ship at the state's time. */
export function environment(
  state: ShipSystemsState,
  kinematics: ShipKinematics = RESTING,
  extra: Partial<EnvironmentEffects> = {},
): EnvironmentEffects {
  return {
    t: state.t,
    kinematics,
    specificForce: ZERO,
    targets: [],
    intensity: {},
    fieldSignals: {},
    sunlight: { direction: { x: 1, y: 0, z: 0 }, irradiance: 0 },
    ...extra,
  };
}

/** A target as the camera sees it. */
export const target = (
  id: string,
  relativePosition: Vec3,
  relativeVelocity: Vec3 = ZERO,
  radius = 100,
): SensorTarget => ({ id, kind: 'body', relativePosition, relativeVelocity, radius });

/** Inverse of a symmetric 3×3 [xx, xy, xz, yy, yz, zz]. */
export function inverseSym3(m: Sym3): Sym3 {
  const [a, b, c, d, e, f] = m;
  const A = d * f - e * e;
  const B = c * e - b * f;
  const C = b * e - c * d;
  const det = a * A + b * B + c * C;
  return [
    A / det,
    B / det,
    C / det,
    (a * f - c * c) / det,
    (b * c - a * e) / det,
    (a * d - b * b) / det,
  ];
}

const apply = (m: Sym3, v: Vec3): Vec3 => ({
  x: m[0] * v.x + m[1] * v.y + m[2] * v.z,
  y: m[1] * v.x + m[3] * v.y + m[4] * v.z,
  z: m[2] * v.x + m[4] * v.y + m[5] * v.z,
});

/** Net body-frame force and torque about the centre of mass of one step's actuator output. */
export function netWrench(result: ShipStepResult): { force: Vec3; torque: Vec3 } {
  const com = result.actuators.massProperties.centerOfMass;
  let force: Vec3 = ZERO;
  let torque: Vec3 = result.actuators.torque;
  for (const thrust of result.actuators.thrusts) {
    force = add(force, thrust.force);
    torque = add(torque, cross(sub(thrust.point, com), thrust.force));
  }
  return { force, torque };
}

/** Total RCS propellant aboard, kg. */
export const rcsPropellant = (state: ShipSystemsState): number =>
  (state.tanks['rcs-left'] ?? 0) + (state.tanks['rcs-right'] ?? 0);

export interface FlightOptions {
  readonly dt?: number;
  /** Seconds to fly. */
  readonly duration: number;
  /** Starting rigid-body state (default: at rest, identity attitude). */
  readonly kinematics?: ShipKinematics;
  /** Starting systems state (default: a fresh arrival). */
  readonly state?: ShipSystemsState;
  /** Commands for step k (the step starting at k·dt). */
  readonly commands?: (step: number, state: ShipSystemsState) => readonly Command[];
  /** Called after every step with the new state of the ship and the step's result. */
  readonly each?: (
    step: number,
    state: ShipSystemsState,
    kinematics: ShipKinematics,
    result: ShipStepResult,
  ) => void;
}

export interface Flight {
  readonly state: ShipSystemsState;
  readonly kinematics: ShipKinematics;
  /** Largest magnitude of the angular velocity seen, rad/s. */
  readonly peakRate: number;
  /** RCS propellant used, kg. */
  readonly rcsUsed: number;
}

/**
 * Fly the ship as a free rigid body with nothing acting on it but its own thrusters: each step
 * runs the ship systems and then the scheme in this file's header.
 */
export function fly(definition: ShipDefinition, options: FlightOptions): Flight {
  const dt = options.dt ?? 1;
  let state = options.state ?? createShipSystemsState(definition, 'ship-flight');
  let kinematics = options.kinematics ?? RESTING;
  const before = rcsPropellant(state);
  let peakRate = 0;
  const steps = Math.round(options.duration / dt);
  for (let step = 0; step < steps; step++) {
    const result = stepShipSystems(
      state,
      definition,
      options.commands?.(step, state) ?? [],
      environment(state, kinematics),
      dt,
    );
    state = result.state;
    const mass = result.actuators.massProperties;
    const tensor = inertiaTensor(mass.inertia);
    const { force, torque } = netWrench(result);
    const w = kinematics.angularVelocity;
    const gyroscopic = cross(w, apply(tensor, w));
    const angularVelocity = add(w, scale(apply(inverseSym3(tensor), sub(torque, gyroscopic)), dt));
    const attitude: Quat = integrateBodyRate(kinematics.attitude, angularVelocity, dt);
    const velocity = add(
      kinematics.velocity,
      scale(rotate(kinematics.attitude, force), dt / mass.mass),
    );
    kinematics = {
      position: add(kinematics.position, scale(velocity, dt)),
      velocity,
      attitude,
      angularVelocity,
    };
    peakRate = Math.max(
      peakRate,
      Math.hypot(angularVelocity.x, angularVelocity.y, angularVelocity.z),
    );
    options.each?.(step, state, kinematics, result);
  }
  return { state, kinematics, peakRate, rcsUsed: before - rcsPropellant(state) };
}
