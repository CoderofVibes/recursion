/**
 * What the console and 3D view receive each frame. Built by the game layer from the believed
 * world, issued forecasts and Black Box records; never from truth (lint-enforced, P11).
 *
 * Display semantics (DECISIONS P10): forecasts are issued centre-of-mass paths, drawn dotted
 * and frozen; `trail` is the measured path, drawn solid; body axis and thrust direction are
 * ticks on the ship; the envelope widens where samples are extrapolating.
 */

import type { Vec2 } from '../lib/vec2.ts';
import type { BelievedWorld } from './belief.ts';
import type { Objective } from './encounter.ts';
import type { Forecast } from './forecast.ts';
import type { AttemptId, EquipmentId, ObjectId } from './ids.ts';
import type { Fraction, Meters, Newtons, Radians, Seconds } from './units.ts';

export interface TrailPoint {
  readonly t: Seconds;
  readonly position: Vec2;
}

export interface ThrustTick {
  readonly source: EquipmentId;
  /** Application point, body frame. */
  readonly point: Vec2;
  /** Unit direction of force on the ship, body frame. */
  readonly direction: Vec2;
  readonly magnitude: Newtons;
}

/** Ship geometry for drawing; kinematics come from world.ship. */
export interface ShipView {
  /** Current configuration's hull outline, body frame. */
  readonly footprint: readonly Vec2[];
  /** Body frame. */
  readonly centerOfMass: Vec2;
  /** Commanded thrust right now. */
  readonly thrust: readonly ThrustTick[];
}

export interface SensorSector {
  readonly sensor: EquipmentId;
  /** Inertial direction of the sector centre. */
  readonly center: Radians;
  readonly halfWidth: Radians;
  readonly range: Meters;
  /** 0 useless to 1 full quality (depends on power, condition). */
  readonly quality: Fraction;
}

/** Where the ship can currently sense. Everything else reads as unknown. */
export interface SensorCoverage {
  readonly sectors: readonly SensorSector[];
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
