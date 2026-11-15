/** Belief-only display input. Until a shared field contract lands, this is a versioned,
 * fail-closed payload for BelievedField.visual, never a truth-field parameter object. */
import type { BelievedField } from '../../../contracts/index.ts';
import type { Vec3 } from '../../../lib/vec3.ts';

export const WELL_VIEW_KIND = 'inverse-well';

export interface WellEstimate {
  readonly value: number;
  readonly sigma: number;
}

export interface WellResponseEvidence {
  readonly experiment: string;
  readonly axis: 'radial' | 'tangent-1' | 'tangent-2' | 'outside' | 'coast';
  readonly role: 'training' | 'held-out';
  /** Gain for powered comparisons; acceleration residual in m/s² for the coast control. */
  readonly response: WellEstimate;
  readonly measurementIds: readonly string[];
}

export interface WellObservation {
  readonly provenance: {
    readonly attemptId: string;
    readonly frameId: string;
    readonly measurementIds: readonly string[];
    readonly from: number;
    readonly to: number;
    /** False for archived coordinates after recurrence; never overlay them on the current run. */
    readonly current: boolean;
  };
  readonly support: 'supported' | 'unresolved';
  /** Supplied by the model's navigation/geometry freshness policy, not a UI timeout. */
  readonly validUntil: number;
  readonly rule: 'ordinary' | 'candidate' | 'adopted';
  readonly responses: readonly WellResponseEvidence[];
}

/** Legacy S5/S16 fixture geometry only; A19's physical funnels use v2. */
export interface WellVisual extends WellObservation {
  readonly schema: 'well-observation-v1';
  readonly geometry: {
    readonly center: Vec3;
    /** Conservative one-sigma position bound, including correlated navigation uncertainty. */
    readonly centerSigma: number;
    readonly innerRadius: WellEstimate;
    readonly outerRadius: WellEstimate;
  };
}

const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const ids = (v: unknown): v is readonly string[] =>
  Array.isArray(v) && v.length > 0 && v.every(text) && new Set(v).size === v.length;
const estimate = (v: unknown): v is WellEstimate =>
  object(v) && finite(v.value) && finite(v.sigma) && v.sigma >= 0;

/** No implicit radii, response gains, age limits or source IDs may fill absent evidence. */
export function validWellObservation(v: unknown): v is WellObservation {
  if (!object(v)) return false;
  const p = v.provenance;
  if (
    !object(p) ||
    !text(p.attemptId) ||
    !text(p.frameId) ||
    !ids(p.measurementIds) ||
    !finite(p.from) ||
    !finite(p.to) ||
    p.to < p.from ||
    typeof p.current !== 'boolean' ||
    !finite(v.validUntil) ||
    v.validUntil < p.to ||
    !['supported', 'unresolved'].includes(String(v.support)) ||
    !['ordinary', 'candidate', 'adopted'].includes(String(v.rule)) ||
    !Array.isArray(v.responses)
  )
    return false;
  const owned = new Map<string, string>();
  for (const r of v.responses) {
    if (
      !object(r) ||
      !text(r.experiment) ||
      !ids(r.measurementIds) ||
      !estimate(r.response) ||
      !['radial', 'tangent-1', 'tangent-2', 'outside', 'coast'].includes(String(r.axis)) ||
      !['training', 'held-out'].includes(String(r.role))
    )
      return false;
    for (const id of r.measurementIds) {
      // Independent completed experiments may not claim the same acquired sample.
      const owner = `${r.experiment}:${r.role}`;
      if (owned.has(id) && owned.get(id) !== owner) return false;
      owned.set(id, owner);
    }
  }
  return true;
}

export function readWellVisual(field: BelievedField): WellVisual | undefined {
  if (!field.detected || field.kind !== WELL_VIEW_KIND) return undefined;
  const v: unknown = field.visual;
  if (!object(v) || v.schema !== 'well-observation-v1' || !validWellObservation(v))
    return undefined;
  const g = v.geometry;
  if (
    !object(g) ||
    !object(g.center) ||
    !finite(g.center.x) ||
    !finite(g.center.y) ||
    !finite(g.center.z) ||
    !finite(g.centerSigma) ||
    g.centerSigma < 0 ||
    !estimate(g.innerRadius) ||
    !estimate(g.outerRadius) ||
    g.innerRadius.value <= 0 ||
    g.outerRadius.value <= g.innerRadius.value
  )
    return undefined;
  return v as unknown as WellVisual;
}

export type WellDisplayState = 'unknown' | 'archived' | 'unresolved' | 'stale' | 'current';

export function wellDisplayState(visual: WellObservation | undefined, t: number): WellDisplayState {
  if (!visual || !Number.isFinite(t) || t < visual.provenance.to) return 'unknown';
  if (!visual.provenance.current) return 'archived';
  if (visual.support !== 'supported') return 'unresolved';
  return t > visual.validUntil ? 'stale' : 'current';
}
