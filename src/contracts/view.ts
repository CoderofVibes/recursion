/**
 * What the console and 3D view receive each frame. Built by the game layer from the believed
 * world, issued forecasts and Black Box records; never from truth (lint-enforced, P11).
 *
 * Display semantics (DECISIONS P10): forecasts are issued centre-of-mass paths, drawn dotted
 * and frozen; `trail` is the measured path, drawn solid; body axis and thrust direction are
 * ticks on the ship; the envelope widens where samples are extrapolating.
 */

import type { Vec3 } from '../lib/vec3.ts';
import type { BelievedWorld } from './belief.ts';
import type { Objective } from './encounter.ts';
import type { Forecast } from './forecast.ts';
import type { AttemptId, EquipmentId, ObjectId } from './ids.ts';
import type { Hull } from './ship.ts';
import type { Fraction, Meters, Newtons, Radians, Seconds } from './units.ts';

export interface TrailPoint {
  readonly t: Seconds;
  readonly position: Vec3;
}

export interface ThrustTick {
  readonly source: EquipmentId;
  /** Application point, body frame. */
  readonly point: Vec3;
  /** Unit direction of force on the ship, body frame. */
  readonly direction: Vec3;
  readonly magnitude: Newtons;
}

/** Ship geometry for drawing; kinematics come from world.ship. */
export interface ShipView {
  /** Current configuration's occupied volume, body frame. */
  readonly hull: Hull;
  /** Body frame. */
  readonly centerOfMass: Vec3;
  /** Commanded thrust right now. */
  readonly thrust: readonly ThrustTick[];
}

/** A sensor's field of view: a cone from the ship along `axis`. */
export interface SensorCone {
  readonly sensor: EquipmentId;
  /** Inertial unit vector along the cone's axis (the boresight). */
  readonly axis: Vec3;
  /** Angle from the axis to the cone's edge. */
  readonly halfAngle: Radians;
  readonly range: Meters;
  /** 0 useless to 1 full quality (depends on power, condition). */
  readonly quality: Fraction;
}

/** Where the ship can currently sense. Everything else reads as unknown. */
export interface SensorCoverage {
  readonly cones: readonly SensorCone[];
}

/** One attempt in a two-attempt Black Box comparison overlay. */
export interface AttemptOverlay {
  readonly attemptId: AttemptId;
  readonly label: string;
  readonly trail: readonly TrailPoint[];
  readonly forecast?: Forecast;
}

export type Selection =
  | { readonly kind: 'object'; readonly id: ObjectId }
  | { readonly kind: 'equipment'; readonly id: EquipmentId };

export interface ViewSnapshot {
  readonly t: Seconds;
  readonly paused: boolean;
  /** Sim seconds per real second. */
  readonly warp: number;
  readonly world: BelievedWorld;
  readonly ship: ShipView;
  /** Measured path of the current attempt. */
  readonly trail: readonly TrailPoint[];
  /** Issued forecasts to draw, oldest first. */
  readonly forecasts: readonly Forecast[];
  readonly coverage: SensorCoverage;
  readonly objectives: readonly Objective[];
  readonly compare?: readonly [AttemptOverlay, AttemptOverlay];
  readonly selection?: Selection;
}
