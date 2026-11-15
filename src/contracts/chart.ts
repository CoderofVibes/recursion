/**
 * The chart the MAP shows (DECISIONS A8; brief §1: the exit is never labelled): only what the
 * ship has charted. Regions it has surveyed, corridors it has flown, bearings it has taken, what
 * Black Box recorded there. Everything a chart does not mention is unsurveyed.
 *
 * Built by the game layer from Black Box and the expedition (`GameControls.chart()`); belief
 * side (P11). The chart frame is the expedition's own inertial frame: right-handed, metres, with
 * the first charted region at its origin; it has no preferred plane (A8: the universe extends in
 * all directions).
 */

import type { Vec3 } from '../lib/vec3.ts';
import type { AttemptOutcome } from './attempt.ts';
import type { EncounterId, LeadId } from './ids.ts';
import type { Fraction, Meters, Radians } from './units.ts';

export interface ChartAttempt {
  /** 1-based count of attempts in this save. */
  readonly index: number;
  readonly outcome: AttemptOutcome['kind'];
}

/** A region of surveyed space: an encounter the ship has reached. */
export interface ChartRegion {
  readonly id: EncounterId;
  /** Short instrument label, e.g. "GRAVITY RANGE". */
  readonly name: string;
  /** Centre, chart frame. */
  readonly position: Vec3;
  /** Radius of the bubble of space the ship has been in or surveyed there. */
  readonly radius: Meters;
  /**
   * Survey coverage, 0 to 1: how much of what is there the model has measured (bodies whose
   * pull it has measured at some distance, rules adopted there).
   */
  readonly surveyed: Fraction;
  /** The ship is here now. */
  readonly current: boolean;
  /** Attempts Black Box recorded here, oldest first. */
  readonly attempts: readonly ChartAttempt[];
}

/** A corridor the ship has flown between two regions. */
export interface ChartCorridor {
  readonly from: EncounterId;
  readonly to: EncounterId;
}

/** A lead on the chart: a bearing taken from a region, range unknown. */
export interface ChartLead {
  readonly id: LeadId;
  readonly name: string;
  /** Region the bearing was taken from. */
  readonly from: EncounterId;
  /** Unit vector, chart frame. */
  readonly direction: Vec3;
  /** Half-angle of the cone the lead lies in. */
  readonly spread: Radians;
}

export interface Chart {
  readonly regions: readonly ChartRegion[];
  readonly corridors: readonly ChartCorridor[];
  readonly leads: readonly ChartLead[];
  /** How far the propellant on board can take the ship from the current region. Absent: not known. */
  readonly reach?: Meters;
}
