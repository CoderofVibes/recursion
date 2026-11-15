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
import type { AttemptId, EquipmentId, FieldId, ObjectId } from './ids.ts';
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

/**
 * A look a sensor took in an earlier attempt of this encounter, rebuilt from Black Box records
 * (R6): where the ship believed it was, which way the sensor looked and how far it could see.
 * It says what was sensed then, not what is there now: things have moved since (A10).
 */
export interface CoverageLook {
  readonly attemptId: AttemptId;
  readonly sensor: EquipmentId;
  /** Ship time in that attempt over which this look held (the sensor neither turned much nor the ship moved far). */
  readonly from: Seconds;
  readonly to: Seconds;
  /** Where the ship believed it was, in this encounter's briefing frame. */
  readonly origin: Vec3;
  /** Inertial unit vector along the sensor's axis. */
  readonly axis: Vec3;
  readonly halfAngle: Radians;
  readonly range: Meters;
}

/** One attempt in a two-attempt Black Box comparison overlay. */
export interface AttemptOverlay {
  readonly attemptId: AttemptId;
  readonly label: string;
  readonly trail: readonly TrailPoint[];
  readonly forecast?: Forecast;
}

/**
 * One thing the unaided eye can see through the window: light only, no sensor (A3, A8, P11).
 * A direction and an apparent size, never a range.
 */
export interface WindowObject {
  readonly id: ObjectId;
  readonly kind: 'body' | 'asteroid';
  /** Inertial unit vector from the ship toward the object's centre. */
  readonly direction: Vec3;
  /** Half the angle the object spans as seen from the ship. */
  readonly angularRadius: Radians;
  /** In sunlight (not inside another body's shadow). An unlit object is seen as a dark disc against the stars, if at all. */
  readonly lit: boolean;
}

/**
 * A visible bank of radiation clouds (A18 (2): the crescent beyond the Gravity range's belt).
 * [FICTIONAL] Its glow is fiction: ordinary radiation does not shine (S21). As the eye sees it:
 * patches of glow on the sky, each a direction, an apparent radius and a brightness, sampled
 * through the bank's volume, nearest first. Never a range or a dose. Patches hidden behind a
 * body are left out.
 */
export interface WindowCloudBank {
  readonly kind: 'cloud-bank';
  readonly id: FieldId;
  readonly patches: readonly {
    /** Inertial unit vector from the ship. */
    readonly direction: Vec3;
    readonly angularRadius: Radians;
    /** 0 to 1: the glow there against the bank's brightest. */
    readonly brightness: Fraction;
  }[];
}

/**
 * A funnel (A19) as the eye sees it: 3B's optical projection (`well-optical-v1`,
 * `src/view3d/fields/wells/funnel.ts` `WindowFunnelVisual`), the visible arcs as inertial unit
 * rays from the eye. Filled by 3B's encounter through `EncounterSetup.window`.
 */
export interface WindowFunnel {
  readonly kind: 'funnel';
  readonly id: FieldId;
  readonly schema: 'well-optical-v1';
  readonly observedAt: Seconds;
  readonly visible: boolean;
  readonly phase: 'precursor' | 'ramping' | 'active' | 'fading';
  /** Observed brightness, 0 to 1. */
  readonly brightness: Fraction;
  /** Visible arcs: inertial unit rays from the eye; depth is a colour coordinate, not a range. */
  readonly segments: readonly { readonly from: Vec3; readonly to: Vec3; readonly depth: number }[];
}

/** A field the eye can see through the window. */
export type WindowField = WindowCloudBank | WindowFunnel;

/**
 * What is outside the window right now, as the eye sees it. Built by the game layer each
 * frame; it holds nothing that needs an instrument. Objects too small or too faint to see are
 * absent, whether or not the ship has catalogued them, and an object the ship has never
 * catalogued can be here. A field is here only when it can be seen (`fields`).
 */
export interface WindowView {
  /**
   * The sun: inertial unit vector toward it, and whether it is in view (not behind a body).
   * Absent where the encounter has no sun.
   */
  readonly sun?: { readonly direction: Vec3; readonly visible: boolean };
  /** Sunlight reaches the ship (it is not in a body's shadow). */
  readonly sunlit: boolean;
  readonly objects: readonly WindowObject[];
  /** Visible fields (R38): the radiation clouds, the funnels. Absent: none in view. */
  readonly fields?: readonly WindowField[];
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
  /** The view through the window. Absent from fixtures and stand-ins that have no world. */
  readonly window?: WindowView;
  /**
   * Coverage sensed in earlier attempts of this encounter, oldest first, from Black Box (R6).
   * This attempt's own history is the view's to keep. Absent: none recorded.
   */
  readonly coverageEarlier?: readonly CoverageLook[];
}
