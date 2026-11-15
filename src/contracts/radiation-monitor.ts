/** A24/P11: one instrument's acquired dose RATE. No component dose or geometry. */
import type { EquipmentId } from './ids.ts';
import type { LatticeIntensity, Seconds } from './units.ts';

export interface RadiationDoseRateReading {
  readonly version: 1;
  readonly source: EquipmentId;
  readonly t: Seconds;
  /** U = d(U s)/dt, in the game's fictional exposure units; not Gy/s or Sv/s. */
  readonly rate: LatticeIntensity;
  /** Readout-derived one-sigma noise estimate. Not a bound on lag, clipping or missed peaks. */
  readonly sigma: LatticeIntensity;
  /** Over-range readout: the displayed value is a lower limit, never a precise peak. */
  readonly saturated: boolean;
  readonly responseTime: Seconds;
  readonly saturationRate: LatticeIntensity;
  readonly validUntil: Seconds;
}

export interface RadiationCaution {
  readonly id: 'radiation-high';
  readonly level: 'caution';
  readonly source: EquipmentId;
  readonly reportedAt: Seconds;
  readonly validUntil: Seconds;
  readonly rate: LatticeIntensity;
  readonly saturated: boolean;
  readonly threshold: LatticeIntensity;
}

/** Keep the ordering cursor even after a fresh low sample clears the caution. */
export interface RadiationCautionState {
  readonly latestReadingAt?: Seconds;
  readonly caution?: RadiationCaution;
}
