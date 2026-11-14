/**
 * Commands, plans and procedures.
 *
 * A plan is a timed sequence of commands, relative to the plan's epoch (the sim time at which
 * the player committed it). Committing a plan issues a forecast (forecast.ts).
 * A procedure (DECISIONS P9) is a saved command sequence that worked, with the conditions it
 * started from, so the console can say whether current conditions match.
 */

import type { Vec2 } from '../lib/vec2.ts';
import type { Cov2 } from './estimates.ts';
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
import type { Fraction, Hertz, Radians, RadiansPerSecond, Seconds, Watts } from './units.ts';

/**
 * What the attitude controller should hold. Directions refer to the body axis (+x).
 * Velocity references use the ship's believed velocity, never truth.
 */
export type AttitudeTarget =
  /** Hold the body axis at an inertial angle. */
  | { readonly reference: 'inertial'; readonly angle: Radians }
  /** Body axis along believed velocity, plus offset. */
  | { readonly reference: 'prograde'; readonly offset?: Radians }
  | { readonly reference: 'retrograde'; readonly offset?: Radians }
  /** Body axis toward an object's believed position, plus offset. */
  | { readonly reference: 'toward'; readonly target: ObjectId; readonly offset?: Radians }
  | { readonly reference: 'away'; readonly target: ObjectId; readonly offset?: Radians }
  /** Command a constant angular rate. */
  | { readonly reference: 'rate'; readonly rate: RadiansPerSecond }
  /** Controller off; the ship tumbles freely. */
  | { readonly reference: 'free' };

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
  /** Power allocated to a load. Sources and batteries ignore it. */
  | { readonly kind: 'power'; readonly equipment: EquipmentId; readonly allocation: Watts }
  | { readonly kind: 'mode'; readonly equipment: EquipmentId; readonly mode: string }
  /** Point a sensor at an object, or at an inertial angle when target is null. */
  | {
      readonly kind: 'point';
      readonly sensor: EquipmentId;
      readonly target: ObjectId | null;
      readonly angle?: Radians;
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
  readonly position: Vec2;
  readonly velocity: Vec2;
  readonly positionCov: Cov2;
  readonly attitude: Radians;
  /** Match tolerances. */
  readonly tolerance: {
    readonly position: number;
    readonly velocity: number;
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
