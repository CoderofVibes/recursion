/** R36: additive recorded camera data only. No truth geometry or new Measurement kind. */
import type { Vec3 } from '../lib/vec3.ts';
import type { AttemptId, EncounterId, EquipmentId } from './ids.ts';
import type { Hertz, Radians, Seconds, Watts } from './units.ts';

/** Visible morphology, not an assertion about force, crushing or an activation deadline. */
export type WellAppearancePhase = 'unresolved' | 'precursor' | 'ramping' | 'active' | 'fading';
/** Symmetric 2D covariance [xx, xy, yy] in image-slope coordinates. */
export type WellImageCovariance = readonly [number, number, number];

export interface WellContourBearing {
  /** Frame-local address; never a site, ring, throat or hidden catalogue identity. */
  readonly id: string;
  /** Gnomonic image slopes in this frame's camera basis, dimensionless. */
  readonly start: readonly [number, number];
  readonly end: readonly [number, number];
  /** Conditional endpoint errors. Also propagate the COMMON basis error below. */
  readonly startCov: WellImageCovariance;
  readonly endCov: WellImageCovariance;
  readonly phase: WellAppearancePhase;
}

export interface WellCameraFrame {
  readonly version: 1;
  readonly id: string;
  /** Public channel identity; no per-site truth IDs cross this boundary. */
  readonly field: 'well-camera';
  readonly source: EquipmentId;
  readonly sequence: number;
  /** Current implementation samples one physical snapshot; never backdates an exposure. */
  readonly acquisition: readonly [Seconds, Seconds];
  /** Completion of retention; original acquisition time is preserved across packet delays. */
  readonly availableAt: Seconds;
  readonly exposure: Seconds;
  readonly cameraPower: Watts;
  readonly effectiveRate: Hertz;
  /** Measured camera pointing basis in BODY coordinates; ship attitude is separate evidence. */
  readonly basis: { readonly forward: Vec3; readonly right: Vec3; readonly up: Vec3 };
  readonly basisSigma: Radians;
  readonly basisCorrelation: 'frame-common-rotation';
  readonly coverage: {
    readonly status: 'unresolved';
    readonly halfAngle: Radians;
    /** Budgeted/partial imagery is never a certificate that unobserved space is clear. */
    readonly truncated: boolean;
  };
  readonly contours: readonly WellContourBearing[];
}

export interface WellAcquisitionScope {
  readonly runId: string;
  readonly attemptId: AttemptId;
  readonly encounterId: EncounterId;
  readonly frameId: string;
}
/** Preserve original indices; do not renumber after filtering or combine reused local IDs. */
export interface WellMeasurementLineage {
  readonly scope: WellAcquisitionScope;
  readonly measurementIndex: number;
  readonly sampleId: string;
}
export interface WellRecordedProduct {
  readonly schema: 'well-recorded-product-v1';
  readonly scope: WellAcquisitionScope;
  readonly measurementIndex: number;
  readonly product: WellCameraFrame;
  readonly lineage: readonly [WellMeasurementLineage, ...WellMeasurementLineage[]];
}
