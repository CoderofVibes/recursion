/**
 * Measurements and ship events: everything the ship actually senses.
 *
 * These are the only inputs the predictive model and Black Box receive (DECISIONS P7, P11).
 * Value layouts per kind are fixed here; see README § Measurement kinds.
 */

import type {
  EquipmentId,
  FieldId,
  ObjectId,
  ObjectiveId,
  TankId,
  TelemetryChannel,
  ThermalNodeId,
} from './ids.ts';
import type { Command } from './commands.ts';
import type { Gray, Kelvin, NewtonSeconds, Seconds } from './units.ts';

export type MeasurementKind =
  /** [θ] rad: inertial direction from ship to target centre. Needs `target`. */
  | 'bearing'
  /** [ρ] m: distance from ship to target centre. Needs `target`. */
  | 'range'
  /** [x, y] m: ship position relative to target centre, inertial frame. Needs `target`. */
  | 'relative-position'
  /** [ax, ay] m/s²: non-gravitational specific force, body frame. Gravity is never sensed. */
  | 'accel'
  /** [ψ] rad: attitude (star tracker). */
  | 'attitude'
  /** [ω] rad/s: angular rate (gyro). */
  | 'rate'
  /** [v]: housekeeping reading, unit given by the channel. Needs `channel`. */
  | 'telemetry'
  /** [Ḋ] Gy/s: dose rate at the sensing equipment. */
  | 'dose-rate'
  /** Field-specific processed product (e.g. lattice reconstruction samples). Needs `field`. */
  | 'field-signal';

export interface Measurement {
  readonly kind: MeasurementKind;
  /** Sim time of validity. */
  readonly t: Seconds;
  /** Equipment that produced it. */
  readonly source: EquipmentId;
  readonly target?: ObjectId;
  readonly channel?: TelemetryChannel;
  readonly field?: FieldId;
  readonly value: readonly number[];
  /** One-sigma noise per component, same length as value. */
  readonly sigma: readonly number[];
}

export type LossCause =
  | 'collision'
  | 'power'
  | 'thermal'
  | 'radiation'
  | 'life-support'
  | 'propellant'
  | 'structural'
  | 'other';

/** Something the ship noticed. Recorded by Black Box. */
export type ShipEvent =
  | {
      readonly kind: 'contact';
      readonly t: Seconds;
      /** Present only if the ship can tell what it hit. */
      readonly with?: ObjectId;
      readonly impulse: NewtonSeconds;
    }
  | {
      readonly kind: 'equipment-fault';
      readonly t: Seconds;
      readonly equipment: EquipmentId;
      readonly fault: string;
    }
  | { readonly kind: 'equipment-recovered'; readonly t: Seconds; readonly equipment: EquipmentId }
  | { readonly kind: 'breaker-trip'; readonly t: Seconds; readonly equipment: EquipmentId }
  | {
      readonly kind: 'load-shed';
      readonly t: Seconds;
      readonly equipment: EquipmentId;
      readonly reason: string;
    }
  | {
      readonly kind: 'command-rejected';
      readonly t: Seconds;
      readonly command: Command;
      readonly reason: string;
    }
  | { readonly kind: 'propellant-low'; readonly t: Seconds; readonly tank: TankId }
  | { readonly kind: 'propellant-depleted'; readonly t: Seconds; readonly tank: TankId }
  | {
      readonly kind: 'thermal-limit';
      readonly t: Seconds;
      readonly node: ThermalNodeId;
      readonly temperature: Kelvin;
    }
  | { readonly kind: 'battery-depleted'; readonly t: Seconds; readonly equipment: EquipmentId }
  | {
      readonly kind: 'exposure';
      readonly t: Seconds;
      readonly equipment: EquipmentId;
      /** Dose received in this event. */
      readonly dose: Gray;
    }
  | {
      readonly kind: 'configuration-changed';
      readonly t: Seconds;
      readonly configuration: string;
    }
  | {
      readonly kind: 'objective';
      readonly t: Seconds;
      readonly objective: ObjectiveId;
      readonly status: 'reached' | 'missed';
    }
  | { readonly kind: 'recall'; readonly t: Seconds }
  | { readonly kind: 'ship-lost'; readonly t: Seconds; readonly cause: LossCause };

export type ShipEventKind = ShipEvent['kind'];
