/**
 * Commands, plans and procedures.
 *
 * A plan is a timed sequence of commands, relative to the plan's epoch (the sim time at which
 * the player committed it). Committing a plan issues a forecast (forecast.ts).
 * A procedure (DECISIONS P9) is a saved command sequence that worked, with the conditions it
 * started from, so the console can say whether current conditions match.
 */

import type { Quat } from '../lib/quat.ts';
import type { Vec3 } from '../lib/vec3.ts';
import type { Cov3 } from './estimates.ts';
import type {
  AttemptId,
  ConfigurationId,
  EncounterId,
  EquipmentId,
  ObjectId,
  PlanId,
  PlanItemId,
  ProcedureId,
} from './ids.ts';
import type { Fraction, Hertz, Radians, Seconds, Watts } from './units.ts';

/**
 * What the attitude controller should hold. Directions refer to the body axis (+x).
 * Velocity references use the ship's believed velocity, never truth.
 *
 * Roll is held (DECISIONS A11): a pointing target turns the body axis onto its direction by the
 * smallest rotation from the attitude the ship has when the command executes, adding no roll
 * about the line of sight (`quat.pointAlong` in src/lib, used by the game layer and by the
 * model's forecasts so both resolve a target to the same attitude). The ship itself accepts
 * only `inertial`, `rate` and `free`; the game layer resolves the others first.
 */
export type AttitudeTarget =
  /** Hold a full inertial attitude (body to inertial). */
  | { readonly reference: 'inertial'; readonly attitude: Quat }
  /** Body axis along an inertial direction (need not be unit length), roll held. */
  | { readonly reference: 'direction'; readonly direction: Vec3 }
  /** Body axis along believed velocity, roll held. */
  | { readonly reference: 'prograde' }
  | { readonly reference: 'retrograde' }
  /** Body axis toward (or away from) an object's believed position, roll held. */
  | { readonly reference: 'toward'; readonly target: ObjectId }
  | { readonly reference: 'away'; readonly target: ObjectId }
  /** Command a constant angular velocity, body frame, rad/s. */
  | { readonly reference: 'rate'; readonly rate: Vec3 }
  /** Controller off; the ship tumbles freely. */
  | { readonly reference: 'free' };

/**
 * Hands-on flying (DECISIONS A8, A11): the state of the player's controls. The shell sends it
 * whenever it changes (`GameControls.fly`); it stays in force until the next one. All axes are
 * body frame. Roll has no control: the ship holds zero roll rate.
 */
export interface HandsOnInput {
  /**
   * Translation demand along the body axes, each −1..1 (RCS jets): +x forward, +y left, +z up.
   */
  readonly translate: Vec3;
  /** Yaw rate demand, −1..1: positive turns the nose to the left (toward body +y). */
  readonly yaw: number;
  /** Pitch rate demand, −1..1: positive raises the nose (toward body +z). */
  readonly pitch: number;
  /** Main-engine throttle, 0..1. */
  readonly throttle: Fraction;
}

/** Controls released: no translation, no turn, engine off. */
export const HANDS_ON_NEUTRAL: HandsOnInput = Object.freeze({
  translate: Object.freeze({ x: 0, y: 0, z: 0 }),
  yaw: 0,
  pitch: 0,
  throttle: 0,
});

export const isHandsOnNeutral = (input: HandsOnInput): boolean =>
  input.translate.x === 0 &&
  input.translate.y === 0 &&
  input.translate.z === 0 &&
  input.yaw === 0 &&
  input.pitch === 0 &&
  input.throttle === 0;

export type Command =
  /** Fire a thruster for a duration. If `attitude` is set, the controller holds it during the burn. */
  | {
      readonly kind: 'burn';
      readonly thruster: EquipmentId;
      readonly throttle: Fraction;
      readonly duration: Seconds;
      readonly attitude?: AttitudeTarget;
    }
  /** Stop a thruster (or all) immediately. */
  | { readonly kind: 'cutoff'; readonly thruster: EquipmentId | 'all' }
  | { readonly kind: 'attitude'; readonly target: AttitudeTarget }
  /**
   * Hands-on flying: the controls as they are now, in force until the next `fly` command.
   * A neutral input releases the controls (thrust off, rates nulled, attitude held).
   */
  | { readonly kind: 'fly'; readonly input: HandsOnInput }
  /** Power allocated to a load. Sources and batteries ignore it. */
  | { readonly kind: 'power'; readonly equipment: EquipmentId; readonly allocation: Watts }
  | { readonly kind: 'mode'; readonly equipment: EquipmentId; readonly mode: string }
  /**
   * Point a sensor at an object, or along an inertial direction (need not be unit length) when
   * target is null.
   */
  | {
      readonly kind: 'point';
      readonly sensor: EquipmentId;
      readonly target: ObjectId | null;
      readonly direction?: Vec3;
    }
  | { readonly kind: 'configure'; readonly configuration: ConfigurationId }
  /** Black Box sampling rate (DECISIONS P12: recording costs power and storage). */
  | { readonly kind: 'recorder'; readonly sampleRate: Hertz }
  /** Player annotation; recorded, no physical effect. */
  | { readonly kind: 'mark'; readonly label: string };

export type CommandKind = Command['kind'];

export interface PlanItem {
  readonly id: PlanItemId;
  /** Seconds after the plan epoch. */
  readonly at: Seconds;
  readonly command: Command;
}

export interface Plan {
  readonly id: PlanId;
  readonly name?: string;
  /** Sim time the plan starts; set when committed. */
  readonly epoch: Seconds;
  /** Sorted by `at`. */
  readonly items: readonly PlanItem[];
  readonly fromProcedure?: ProcedureId;
}

export type CommandSource = 'plan' | 'manual' | 'procedure' | 'protection';

/** A command as it actually reached the ship (Black Box "commands actually executed"). */
export interface ExecutedCommand {
  readonly t: Seconds;
  readonly command: Command;
  readonly source: CommandSource;
  readonly planId?: PlanId;
  readonly planItemId?: PlanItemId;
  /** 'limited': executed partially, e.g. throttle capped by available power. */
  readonly status: 'executed' | 'rejected' | 'limited';
  readonly reason?: string;
}

/** Start conditions a procedure was recorded from, and how closely they must match. */
export interface ProcedureCondition {
  readonly encounterId: EncounterId;
  readonly configuration: ConfigurationId;
  readonly position: Vec3;
  readonly velocity: Vec3;
  readonly positionCov: Cov3;
  readonly attitude: Quat;
  /** Match tolerances. */
  readonly tolerance: {
    readonly position: number;
    readonly velocity: number;
    /** Largest rotation between the recorded and the current attitude. */
    readonly attitude: Radians;
  };
}

export interface Procedure {
  readonly id: ProcedureId;
  readonly name: string;
  readonly origin: { readonly attemptId: AttemptId; readonly t: Seconds };
  readonly condition: ProcedureCondition;
  /** Times relative to the procedure start. */
  readonly items: readonly PlanItem[];
}
