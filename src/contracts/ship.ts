/**
 * The ship's nominal design: what the crew knows from the spec sheets.
 *
 * Shared by both worlds. True deviations from these nominal values (misalignment, scale
 * errors, biases) live in truth (`truth/world.ts` HiddenParameters) and are what the
 * predictive model estimates.
 *
 * Body frame: origin at the structural datum, +x along the body axis (the direction the main
 * engine pushes the ship), +y 90° counter-clockwise. Attitude is the inertial angle of body +x.
 */

import type { Vec2 } from '../lib/vec2.ts';
import type { BusId, ConfigurationId, EquipmentId, TankId, ThermalNodeId } from './ids.ts';
import type {
  JsonValue,
  Kelvin,
  KilogramMeters2,
  Kilograms,
  Seconds,
  Volts,
  Watts,
} from './units.ts';

export type EquipmentKind =
  | 'power-source'
  | 'battery'
  | 'power-bus'
  | 'main-engine'
  | 'rcs-thruster'
  | 'reaction-wheel'
  | 'optical-tracker'
  | 'accelerometer'
  | 'star-tracker'
  | 'gyro'
  | 'radiation-monitor'
  | 'processor'
  | 'recorder'
  | 'comms'
  | 'radiator'
  | 'heater'
  | 'life-support'
  | 'other';

/** Where a thruster pushes from, or where a sensor looks. Body frame. */
export interface Mount {
  readonly position: Vec2;
  /** Unit vector. For thrusters: direction of the force on the ship. For sensors: boresight. */
  readonly direction: Vec2;
}

export interface EquipmentSpec {
  readonly id: EquipmentId;
  readonly kind: EquipmentKind;
  readonly name: string;
  readonly mass: Kilograms;
  /** Body-frame position in the default configuration. */
  readonly position: Vec2;
  /** Maximum electrical draw (sources: 0; their output is in params). */
  readonly ratedPower: Watts;
  readonly bus?: BusId;
  readonly thermalNode?: ThermalNodeId;
  /** Operating modes, e.g. ["off", "standby", "on"]. */
  readonly modes: readonly string[];
  readonly defaultMode: string;
  readonly mount?: Mount;
  /** Equipment sharing a group back each other up. */
  readonly redundancyGroup?: string;
  /** Can the power manager shed this load? Life support: false. */
  readonly sheddable: boolean;
  /**
   * Nominal ratings, SI, keyed by name. Names are defined by the ship baseline (1C) and the
   * ship-systems section (2B), e.g. thrust (N), isp (s), capacity (J), sigmaBearing (rad).
   */
  readonly params: Readonly<Record<string, number>>;
}

export interface TankSpec {
  readonly id: TankId;
  readonly name: string;
  readonly position: Vec2;
  readonly capacity: Kilograms;
  readonly propellant: string;
  /** Equipment this tank feeds. */
  readonly feeds: readonly EquipmentId[];
}

export interface BusSpec {
  readonly id: BusId;
  readonly name: string;
  readonly voltage: Volts;
  /** Protection trips above this load. */
  readonly limit: Watts;
}

export interface ThermalNodeSpec {
  readonly id: ThermalNodeId;
  readonly name: string;
  /** J/K. */
  readonly heatCapacity: number;
  /** Operating limits. */
  readonly min: Kelvin;
  readonly max: Kelvin;
}

/**
 * A physical configuration (stowed, radiators deployed, boom extended...).
 * It changes the footprint, and may move equipment and change named ratings.
 */
export interface ConfigurationSpec {
  readonly id: ConfigurationId;
  readonly name: string;
  /** Hull outline in the body frame: a simple polygon, counter-clockwise, metres. */
  readonly footprint: readonly Vec2[];
  /** Equipment whose body-frame position differs from its default in this configuration. */
  readonly equipmentPositions?: Readonly<Record<EquipmentId, Vec2>>;
  /** Overrides of equipment params in this configuration, keyed "equipmentId.param". */
  readonly paramOverrides?: Readonly<Record<string, number>>;
  /** Time to transition into this configuration. */
  readonly transitionTime: Seconds;
}

export interface ShipDefinition {
  readonly id: string;
  readonly name: string;
  /** Structure only (everything not listed as equipment or propellant). */
  readonly structureMass: Kilograms;
  readonly structureCenterOfMass: Vec2;
  /** Structure inertia about its own centre of mass. */
  readonly structureInertia: KilogramMeters2;
  readonly equipment: readonly EquipmentSpec[];
  readonly tanks: readonly TankSpec[];
  readonly buses: readonly BusSpec[];
  readonly thermalNodes: readonly ThermalNodeSpec[];
  readonly configurations: readonly ConfigurationSpec[];
  readonly defaultConfiguration: ConfigurationId;
  /**
   * Full ship-systems detail from the 1C baseline (per-mode power and heat, buses, thermal
   * loops, radiators, reactants, recorder, radiation profiles...). For src/ship only; other
   * code uses the typed fields above.
   */
  readonly systems?: Readonly<Record<string, JsonValue>>;
}

/** Mass properties of the ship as it is right now (configuration and propellant included). */
export interface MassProperties {
  readonly mass: Kilograms;
  /** Body frame. */
  readonly centerOfMass: Vec2;
  /** About the centre of mass, plane-normal axis. */
  readonly inertia: KilogramMeters2;
  /** Current configuration's hull outline, body frame. */
  readonly footprint: readonly Vec2[];
}
