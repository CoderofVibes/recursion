/**
 * Belief-side lattice reconstruction and coverage products (A16/P11).
 *
 * Types only. Geometry is fitted from retained observations in an explicitly identified
 * navigation frame. Nothing here describes truth layers, a generator seed, or a complete
 * mesh. A declaration of coverage is not a sensing implementation or a clearance proof.
 */
import type { Vec3 } from '../lib/vec3.ts';
import type { AttemptId, EquipmentId } from './ids.ts';
import type { LatticeAcquisitionScope, LatticeMeasurementLineage } from './lattice-acquisition.ts';
import type { Fraction, Meters, Seconds } from './units.ts';

/** An axis-aligned volume in the product's identified navigation frame, metres. */
export interface LatticeVolume {
  readonly center: Vec3;
  readonly halfSize: Vec3;
}

/**
 * References to immutable, retained samples and their actual acquisition interval.
 * IDs resolve within the enclosing attempt/frame; publication time is never acquisition time.
 * Empty sample lineage cannot support a fragment, coverage claim, or threat estimate.
 */
export interface LatticeEvidence {
  readonly sampleIds: readonly string[];
  readonly observedFrom: Seconds;
  readonly observedTo: Seconds;
  readonly validUntil: Seconds;
}

/** Latest measured service report, independently aged from any geometry it produced. */
export interface LatticeServiceValidity {
  readonly reportedAt: Seconds;
  readonly validUntil: Seconds;
  readonly available: boolean;
}

export interface LatticeStrand extends LatticeEvidence {
  readonly id: string;
  /** Only connected support actually observed. Never complete or extend a repeating grid. */
  readonly points: readonly Vec3[];
  /** Marginal positional sigma, including common pose error rather than averaging it away. */
  readonly sigmaM: Meters;
  readonly confidence: Fraction;
}

/**
 * Existing v1 wire certificate, separately required from fitting bright fragments/corners.
 *
 * A producer must qualify detection throughout the claimed patch under the actual optics,
 * occlusion, power, condition and association limits. Missing data remains unresolved.
 * `resolutionM` and `undetectedSupportM` are measured/calibrated limits, not field constants.
 * Three sigma is a joint confidence bound including correlated navigation/pose error.
 * This establishes conditional patch support, never a safe whole-ship trajectory.
 */
export interface LatticeClearCoverageCertificate {
  readonly calibrated: true;
  readonly confidenceSigmas: 3;
  readonly resolutionM: Meters;
  readonly undetectedSupportM: Meters;
  readonly sampleIds: readonly string[];
}

export interface LatticeCoverage extends LatticeVolume, LatticeEvidence {
  readonly id: string;
  readonly status: 'unobserved' | 'unresolved' | 'clear-supported';
  readonly reason?: string;
  readonly certificate?: LatticeClearCoverageCertificate;
}

export interface LatticeThreat extends LatticeEvidence {
  readonly componentId: EquipmentId;
  readonly name: string;
  readonly position: Vec3;
  readonly sigmaM: Meters;
  readonly marginM: Meters;
}

/** Existing v1 renderer payload. Extracted unchanged from the 3C display-only contract. */
export interface LatticeVisual {
  readonly schema: 'lattice-observations-v1';
  /** Current-run relative frame. Unaligned archived coordinates are never current obstacles. */
  readonly frameId: string;
  readonly attemptId: AttemptId;
  readonly updatedAt: Seconds;
  /** Requested processing state; availability requires the independently aged service report. */
  readonly enabled: boolean;
  readonly quality: Fraction;
  /** Missing or silent service is never LIVE. */
  readonly processing?: LatticeServiceValidity;
  /** Commanded sensing volume, never the true field's bounds. */
  readonly requestedVolume: LatticeVolume;
  readonly strands: readonly LatticeStrand[];
  readonly coverage: readonly LatticeCoverage[];
  readonly threat?: LatticeThreat;
  readonly limitation?: string;
}

/**
 * Additive producer-side provenance. This is not a new v1 packet schema. All sample records
 * resolve to retained acquisitions; field/layer truth IDs cannot substitute for lineage.
 */
export interface LatticeCoverageProvenance {
  /** Immutable derived-product identity/version to retain with an issued forecast. */
  readonly reconstructionId: string;
  readonly reconstructionVersion: number;
  readonly scope: LatticeAcquisitionScope;
  readonly sourceIds: readonly EquipmentId[];
  readonly inputs: readonly LatticeMeasurementLineage[];
  readonly algorithm: { readonly id: string; readonly version: string };
  readonly calibration: {
    readonly id: string;
    readonly version: string;
    readonly training: readonly LatticeMeasurementLineage[];
    /** Independent held-out acquisitions; producers must reject overlap with training. */
    readonly validation: readonly LatticeMeasurementLineage[];
  };
}

/**
 * Stronger additive form for 2C to retain beside a qualified coverage product.
 *
 * Its producer must validate nonempty lineage, current run/frame alignment, independent
 * calibration/validation, detection bounds, association and correlated pose uncertainty.
 * Mapping to the existing renderer is an explicit projection of the base certificate fields
 * into `LatticeCoverage.certificate`, after qualification; retain this full provenance in the
 * archive and with the issued reconstruction version. The v1 view validator neither checks
 * this additional provenance nor treats the existence of this TypeScript type as evidence.
 */
export interface LatticeQualifiedCoverageCertificate
  extends LatticeClearCoverageCertificate, LatticeEvidence {
  /** Bind qualification to this exact patch and footprint; it cannot certify a larger volume. */
  readonly coverageId: string;
  readonly footprint: LatticeVolume;
  readonly provenance: LatticeCoverageProvenance;
}
