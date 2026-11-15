/**
 * Additive recorded-data contracts for the lattice channel (A16/P11).
 * These types do not extend Measurement, AttemptRecord, or any truth-side contract.
 * Acquisition and product availability are different times: placement uses the former;
 * archival order and whether a product was available to a forecast use the latter.
 */
import type { Vec3 } from '../lib/vec3.ts';
import type { AttemptId, EncounterId, EquipmentId, FieldId } from './ids.ts';
import type { Hertz, Meters, Radians, Seconds, Watts } from './units.ts';

export interface LatticeAngularFragment {
  /** Observation-local identity, never a truth strand or layer identity. */
  readonly id: string;
  /** Gnomonic image slopes in the recorded camera basis, dimensionless. */
  readonly start: readonly [number, number];
  readonly end: readonly [number, number];
  readonly sigma: number;
}

export interface LatticeObservationFrame {
  readonly version: 2;
  readonly id: string;
  readonly field: FieldId;
  readonly sequence: number;
  readonly acquisition: readonly [Seconds, Seconds];
  /** Processed product completion/availability time; never replaces ray acquisition time. */
  readonly availableAt: Seconds;
  readonly source: EquipmentId;
  readonly processorPower: Watts;
  readonly cameraPower: Watts;
  readonly effectiveRate: Hertz;
  readonly exposure: Seconds;
  /** Measured body-frame camera basis. A single error rotates all rays in this frame together. */
  readonly basis: { readonly forward: Vec3; readonly right: Vec3; readonly up: Vec3 };
  /** Isotropic angular one-sigma, rad; covariance = sigma² I on a COMMON small rotation. */
  readonly basisSigma: Radians;
  readonly basisCorrelation: 'frame-common-rotation';
  readonly coverage: {
    /** Angular detections alone do not certify an empty 3D opening. */
    readonly status: 'unresolved';
    readonly halfAngle: Radians;
    readonly rangeLimit: Meters;
    /** Image-slope resolution; it is not an independent range or world-position bound. */
    readonly angularResolution: number;
    readonly truncated: boolean;
  };
  readonly fragments: readonly LatticeAngularFragment[];
}

export interface LatticeDiagnosticTile {
  readonly version: 1;
  readonly id: string;
  readonly field: FieldId;
  readonly source: EquipmentId;
  readonly sequence: number;
  readonly acquisition: readonly [Seconds, Seconds];
  /** Retention time. The current unqueued tile has the same acquisition and availability instant. */
  readonly availableAt: Seconds;
  readonly halfAngle: Radians;
  readonly exposure: Seconds;
  readonly cameraPower: Watts;
  readonly processorPower: Watts;
  readonly acquisitionRate: Hertz;
  /** Actual time since previous retained tile; null on the first. Gaps are never backfilled. */
  readonly sincePrevious: Seconds | null;
  readonly size: 8;
  /** Camera-local channel counts 0..15. Null means unobserved/occluded, never a clear pixel. */
  readonly pixels: readonly (number | null)[];
  readonly pixelSigma: number;
  /** A raw tile cannot certify an empty opening, even when all its observed counts are low. */
  readonly coverage: 'unresolved';
}

/** Public archive/navigation identities; none is a truth seed, strand ID, or hidden world pose. */
export interface LatticeAcquisitionScope {
  readonly runId: string;
  readonly attemptId: AttemptId;
  readonly encounterId: EncounterId;
  /** Identity of the acquired navigation reference frame, not the product's local frame/sample ID. */
  readonly frameId: string;
}

/**
 * An immutable address into the ORIGINAL enclosing AttemptRecord.measurements array.
 * Never renumber it after filtering, sorting derived data, or combining attempts.
 */
export interface LatticeMeasurementLineage {
  readonly scope: LatticeAcquisitionScope;
  /** Zero-based measurement index in that attempt's original retained record. */
  readonly measurementIndex: number;
  /** Recorded local frame/tile ID or a fragment ID within that measured product. */
  readonly sampleId: string;
}

export type LatticeAcquiredProduct = LatticeObservationFrame | LatticeDiagnosticTile;

/**
 * Optional archive-side adapter for 2C; never emitted as a new sensor packet.
 * Construct only from a successfully decoded retained measurement and known enclosing
 * run/attempt/navigation identities. The owning measurement and every lineage address
 * remain immutable. Missing historical scope stays unresolved; it is not guessed from
 * the current run, reused local sequence numbers, a truth seed, or current geometry.
 * Runtime freezing/persistence remain the recorder owner's responsibility.
 */
export interface LatticeRecordedProduct<
  Product extends LatticeAcquiredProduct = LatticeAcquiredProduct,
> {
  readonly schema: 'lattice-recorded-product-v1';
  readonly scope: LatticeAcquisitionScope;
  /** Zero-based original record index of this product, in scope.attemptId. */
  readonly measurementIndex: number;
  readonly product: Product;
  /** A directly acquired product includes its own source address; derived use preserves all inputs. */
  readonly lineage: readonly [LatticeMeasurementLineage, ...LatticeMeasurementLineage[]];
}
