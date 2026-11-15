/**
 * The ship's nominal design: what the crew knows from the spec sheets.
 *
 * Shared by both worlds. True deviations from these nominal values (misalignment, scale
 * errors, biases) live in truth (`truth/world.ts` HiddenParameters) and are what the
 * predictive model estimates.
 *
 * Body frame (right-handed): origin at the structural datum, +x along the body axis (the
 * direction the main engine pushes the ship), +y to the left, +z up. Attitude is a unit
 * quaternion taking body-frame vectors to the inertial frame (DECISIONS A11).
 */

import type { Quat } from '../lib/quat.ts';
import type { Vec2 } from '../lib/vec2.ts';
import type { Vec3 } from '../lib/vec3.ts';
import type { BusId, ConfigurationId, EquipmentId, TankId, ThermalNodeId } from './ids.ts';
import type {
  JsonValue,
  Kelvin,
  KilogramMeters2,
  Kilograms,
  Meters,
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

/**
 * Rotational inertia about the centre of mass, as principal moments and their axes.
 * The tensor in the body frame is R·diag(moments)·Rᵀ with R the rotation matrix of `axes`
 * (`sym3.fromPrincipal` in src/lib). `sym3.principalAxes` builds one from a tensor.
 */
export interface Inertia {
  /** Principal moments about the principal x′, y′ and z′ axes, kg·m². */
  readonly moments: Vec3;
  /** Rotation from the principal frame to the body frame. Identity: body axes are principal. */
  readonly axes: Quat;
}

/** Same moment about every axis (a placeholder for parts whose shape is not modelled). */
export const isotropicInertia = (moment: KilogramMeters2): Inertia => ({
  moments: { x: moment, y: moment, z: moment },
  axes: { w: 1, x: 0, y: 0, z: 0 },
});

/**
 * One convex part of the hull: a convex outline in the body x–y plane, extruded along body z
 * from `zMin` to `zMax` (a prism; a box is a prism with a rectangular outline). The hull is the
 * union of its parts, so a concave ship is several prisms. Clearance and contact are measured
 * against this shape (2G's choice: exact point-to-prism distance, and a planar footprint lifts
 * unchanged).
 */
export interface HullPrism {
  /** Convex outline, counter-clockwise seen from +z, body-frame x and y, metres. */
  readonly outline: readonly Vec2[];
  readonly zMin: Meters;
  readonly zMax: Meters;
  /** Equipment or structure this part belongs to, for the ship view. */
  readonly part?: string;
}

/** The ship's occupied volume in the body frame: a union of convex prisms. */
export type Hull = readonly HullPrism[];

/** A single-prism hull from an outline and a z extent. */
export const prismHull = (
  outline: readonly Vec2[],
  zMin: Meters,
  zMax: Meters,
  part?: string,
): Hull => [part === undefined ? { outline, zMin, zMax } : { outline, zMin, zMax, part }];

/** Farthest hull corner from a body-frame point (usually the centre of mass), m. */
export function hullReach(hull: Hull, from: Vec3): Meters {
  let reach = 0;
  for (const prism of hull) {
    for (const p of prism.outline) {
      for (const z of [prism.zMin, prism.zMax]) {
        const d = Math.hypot(p.x - from.x, p.y - from.y, z - from.z);
        if (d > reach) reach = d;
      }
    }
  }
  return reach;
}

/** Where a thruster pushes from, or where a sensor looks. Body frame. */
export interface Mount {
  readonly position: Vec3;
  /** Unit vector. For thrusters: direction of the force on the ship. For sensors: boresight. */
  readonly direction: Vec3;
}

export interface EquipmentSpec {
  readonly id: EquipmentId;
  readonly kind: EquipmentKind;
  readonly name: string;
  readonly mass: Kilograms;
  /** Body-frame position in the default configuration. */
  readonly position: Vec3;
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
  readonly position: Vec3;
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
 * It changes the hull, and may move equipment and change named ratings.
 */
export interface ConfigurationSpec {
  readonly id: ConfigurationId;
  readonly name: string;
  /** Occupied volume in the body frame in this configuration. */
  readonly hull: Hull;
  /** Equipment whose body-frame position differs from its default in this configuration. */
  readonly equipmentPositions?: Readonly<Record<EquipmentId, Vec3>>;
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
  readonly structureCenterOfMass: Vec3;
  /** Structure inertia about its own centre of mass. */
  readonly structureInertia: Inertia;
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
  readonly centerOfMass: Vec3;
  /** About the centre of mass. */
  readonly inertia: Inertia;
  /** Current configuration's occupied volume, body frame. */
  readonly hull: Hull;
}
