import baseline from '../../../data/ship-baseline.json';
import type { AttitudeTarget, HandsOnInput } from '../../contracts/commands.ts';
import type { ShipDefinition } from '../../contracts/ship.ts';
import type { ShipKinematics } from '../../contracts/truth/ship.ts';
import {
  canonical,
  conjugate,
  multiply,
  normalize,
  toRotationVector,
  type Quat,
} from '../../lib/quat.ts';
import { mulSym3, type Sym3 } from '../../lib/sym3.ts';
import type { Vec3 } from '../../lib/vec3.ts';

/** [ASSUMED] Flight-software play values, `propulsion.attitudeControl` in the baseline. */
export interface ControlSettings {
  /** Commanded angular acceleration per unit rate error, 1/s. */
  readonly rateGain: number;
  /** Commanded rate per unit attitude error, 1/s. */
  readonly attitudeGain: number;
  /** Largest rate the controller asks for when turning to an attitude, rad/s. */
  readonly slewRate: number;
  /** Attitude error (per body axis) the controller leaves alone, rad. */
  readonly attitudeDeadband: number;
  /** Rate error (per body axis) the controller leaves alone, rad/s. */
  readonly rateDeadband: number;
  /** Body rate a full yaw or pitch deflection of the hands-on controls asks for, rad/s. */
  readonly handsOnTurnRate: number;
  /** Weight of a missed torque against a missed force in the jet allocator. */
  readonly torquePriority: number;
}

export const controlSettings = (definition?: ShipDefinition): ControlSettings =>
  ((definition?.systems ?? baseline) as unknown as typeof baseline).propulsion.attitudeControl;

const ZERO: Vec3 = { x: 0, y: 0, z: 0 };

/**
 * Rotation that takes the ship from `attitude` to `target`, as a rotation vector in the body
 * frame (rad): the turn the ship still has to make, by the shorter way.
 */
export function attitudeError(attitude: Quat, target: Quat): Vec3 {
  return toRotationVector(canonical(multiply(conjugate(normalize(attitude)), normalize(target))));
}

/** The part of `value` beyond ±`band` (zero inside it). */
const beyond = (value: number, band: number): number =>
  value > band ? value - band : value < -band ? value + band : 0;

/**
 * The body rate the controller wants (rad/s). Turning to an attitude it asks for a rate along
 * the remaining rotation, proportional to the error beyond the deadband and never faster than
 * the slew rate; a rate target is its own answer.
 */
export function commandedRate(
  target: AttitudeTarget,
  attitude: Quat,
  settings: ControlSettings,
): Vec3 | undefined {
  if (target.reference === 'rate') return target.rate;
  if (target.reference !== 'inertial') return undefined;
  const error = attitudeError(attitude, target.attitude);
  const rate = {
    x: settings.attitudeGain * beyond(error.x, settings.attitudeDeadband),
    y: settings.attitudeGain * beyond(error.y, settings.attitudeDeadband),
    z: settings.attitudeGain * beyond(error.z, settings.attitudeDeadband),
  };
  const magnitude = Math.sqrt(rate.x * rate.x + rate.y * rate.y + rate.z * rate.z);
  if (magnitude <= settings.slewRate) return rate;
  const k = settings.slewRate / magnitude;
  return { x: rate.x * k, y: rate.y * k, z: rate.z * k };
}

/**
 * Body-frame torque (N·m) the attitude controller asks of the jets, or undefined when it asks
 * for nothing: target free or unsupported, or every axis inside its deadband.
 *
 * Rate loop with a deadband: on each body axis whose rate error exceeds the rate deadband the
 * commanded angular acceleration is rateGain × rate error; the torque is the inertia tensor
 * times that acceleration, so products of inertia are accounted for. The gyroscopic term
 * ω × Iω is left to the feedback: at the slew rate it is below one jet's minimum bit per second.
 */
export function attitudeTorque(
  target: AttitudeTarget,
  kinematics: ShipKinematics,
  tensor: Sym3,
  settings: ControlSettings,
): Vec3 | undefined {
  const wanted = commandedRate(target, kinematics.attitude, settings);
  if (!wanted) return undefined;
  const w = kinematics.angularVelocity;
  const act = (error: number) =>
    Math.abs(error) > settings.rateDeadband ? settings.rateGain * error : 0;
  const acceleration = { x: act(wanted.x - w.x), y: act(wanted.y - w.y), z: act(wanted.z - w.z) };
  if (acceleration.x === 0 && acceleration.y === 0 && acceleration.z === 0) return undefined;
  return mulSym3(tensor, acceleration);
}

/** True when every body rate is inside the rate deadband: the ship counts as steady. */
export const ratesNulled = (angularVelocity: Vec3, settings: ControlSettings): boolean =>
  Math.abs(angularVelocity.x) <= settings.rateDeadband &&
  Math.abs(angularVelocity.y) <= settings.rateDeadband &&
  Math.abs(angularVelocity.z) <= settings.rateDeadband;

/**
 * The body rate (rad/s) the hands-on yaw and pitch controls ask for: yaw about +z (nose left),
 * pitch about −y (nose up), roll always zero. A full deflection of either is handsOnTurnRate;
 * both together are scaled back so the turn as a whole never exceeds it (the stick's travel
 * is a circle, not a square), which keeps a diagonal turn inside the star trackers' limit too.
 */
export function handsOnRate(
  input: Pick<HandsOnInput, 'yaw' | 'pitch'>,
  settings: ControlSettings,
): Vec3 {
  const scale = settings.handsOnTurnRate / Math.max(1, Math.hypot(input.yaw, input.pitch));
  // (+ 0: no negative zero, so the stored target survives a JSON save unchanged.)
  return { x: 0, y: -input.pitch * scale + 0, z: input.yaw * scale + 0 };
}

/**
 * Body-frame force (N) the hands-on translation controls ask of the jets: each axis's
 * deflection times the clean translation force the jets have along it (800, 400 and 800 N).
 */
export function handsOnForce(input: HandsOnInput | undefined, definition?: ShipDefinition): Vec3 {
  if (!input) return ZERO;
  const capacity = ((definition?.systems ?? baseline) as unknown as typeof baseline).propulsion.rcs
    .translationForcePerBank;
  const along = (deflection: number, limits: readonly number[]) =>
    deflection > 0 ? deflection * limits[1]! : deflection < 0 ? -deflection * limits[0]! : 0;
  return {
    x: along(input.translate.x, capacity.x),
    y: along(input.translate.y, capacity.y),
    z: along(input.translate.z, capacity.z),
  };
}
