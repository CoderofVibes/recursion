/** TRUTH-side S22 contour projection, not a sensor or light-production implementation.
 * The caller owns photometry, phase chronology, visible arc completion, FOV and occlusion.
 * Only angular rays plus observed brightness/phase cross this adapter's output boundary. */
import type { FieldInstanceSpec } from '../../contracts/truth/fields.ts';
import type { Vec3 } from '../../lib/vec3.ts';
import * as v3 from '../../lib/vec3.ts';
import { readFunnelParameters } from '../../sim/fields/wells.ts';
import type {
  FunnelAppearancePhase,
  WindowFunnelVisual,
} from '../../view3d/fields/wells/funnel.ts';

export interface FunnelOpticalSegment {
  /** Stable within this caller-selected tessellation; never a hidden field/site identifier. */
  readonly index: number;
  readonly kind: 'contour' | 'meridian';
  /** Inertial physical endpoints for the truth-side optical/occlusion adapter only. */
  readonly from: Vec3;
  readonly to: Vec3;
  readonly fromFraction: number;
  readonly toFraction: number;
}

/** Visible portion of the supplied segment, in its parameter space; no reversed/empty spans. */
export type OpticalInterval = readonly [from: number, to: number];

export interface FunnelOpticsInput {
  readonly eye: Vec3;
  readonly observedAt: number;
  readonly brightness: number;
  readonly phase: FunnelAppearancePhase;
  /** Ordered axial fractions in [0,1]. Every vertex uses S22's exact quadratic radius.
   * The caller chooses station spacing and can request a partial visible axial extent. */
  readonly stations: readonly number[];
  readonly azimuthSegments: number;
  /** Required, pure visibility/occlusion/completion clipper. It may return multiple disjoint
   * intervals in increasing order, or [] for no light. There is no fully-visible default. */
  readonly visibleParts: (segment: FunnelOpticalSegment) => readonly OpticalInterval[];
}

const finiteVec = (v: unknown): v is Vec3 =>
  typeof v === 'object' &&
  v !== null &&
  Number.isFinite((v as Vec3).x) &&
  Number.isFinite((v as Vec3).y) &&
  Number.isFinite((v as Vec3).z);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function validateInput(input: FunnelOpticsInput): void {
  if (!finiteVec(input.eye) || !finite(input.observedAt))
    throw new Error('optical eye/time must be finite');
  if (!finite(input.brightness) || input.brightness < 0 || input.brightness > 1)
    throw new Error('optical brightness must be in [0,1]');
  if (!['precursor', 'ramping', 'active', 'fading'].includes(input.phase))
    throw new Error('optical phase must describe visible appearance');
  if (!Number.isSafeInteger(input.azimuthSegments) || input.azimuthSegments < 3)
    throw new Error('optical azimuthSegments must be an integer of at least 3');
  if (!Array.isArray(input.stations) || input.stations.length < 2)
    throw new Error('optical stations require at least two ordered fractions');
  let previous = -1;
  for (const fraction of input.stations) {
    if (!finite(fraction) || fraction < 0 || fraction > 1 || fraction <= previous)
      throw new Error('optical stations must increase strictly within [0,1]');
    previous = fraction;
  }
  if (!Number.isSafeInteger(input.stations.length * input.azimuthSegments * 2))
    throw new Error('optical tessellation segment count is not a safe integer');
  if (typeof input.visibleParts !== 'function')
    throw new Error('optical visibility clipper is required');
}

function validateParts(parts: readonly OpticalInterval[]): void {
  if (!Array.isArray(parts)) throw new Error('optical clipper must return an interval array');
  let previousEnd = 0;
  for (const part of parts) {
    if (
      !Array.isArray(part) ||
      part.length !== 2 ||
      !finite(part[0]) ||
      !finite(part[1]) ||
      part[0] < 0 ||
      part[1] > 1 ||
      part[0] >= part[1] ||
      part[0] < previousEnd
    )
      throw new Error('optical visible intervals must be ordered, disjoint and within [0,1]');
    previousEnd = part[1];
  }
}

/** No result means no visible light, not an invisible site's disclosed position.
 * Rings and meridians are piecewise-linear optical contours at caller-selected resolution.
 * Their sampled vertices lie exactly on R(s)=Rt+(Rm-Rt)(1-s)^2. The arbitrary meridian phase
 * comes from the existing deterministic perpendicular helper; it has no force significance.
 * No nav-camera power, recorder, timer or activation guard is consulted here. */
export function projectFunnelOptics(
  spec: FieldInstanceSpec,
  input: FunnelOpticsInput,
): WindowFunnelVisual | undefined {
  const p = readFunnelParameters(spec);
  validateInput(input);
  if (input.brightness === 0) return undefined;
  const u = v3.anyPerpendicular(p.axis);
  const v = v3.cross(p.axis, u);
  const rings = input.stations.map((fraction) => {
    const center = v3.addScaled(p.mouth, p.axis, fraction * p.length);
    const radius = p.throatRadius + (p.mouthRadius - p.throatRadius) * (1 - fraction) ** 2;
    return Array.from({ length: input.azimuthSegments }, (_, i) => {
      const angle = (i / input.azimuthSegments) * Math.PI * 2;
      const point = v3.addScaled(
        v3.addScaled(center, u, radius * Math.cos(angle)),
        v,
        radius * Math.sin(angle),
      );
      if (!finiteVec(point)) throw new Error('optical contour coordinate overflow');
      return point;
    });
  });
  const segments: Array<WindowFunnelVisual['segments'][number]> = [];
  let index = 0;
  const emit = (
    kind: FunnelOpticalSegment['kind'],
    from: Vec3,
    to: Vec3,
    fromFraction: number,
    toFraction: number,
  ) => {
    const segment: FunnelOpticalSegment = {
      index: index++,
      kind,
      from,
      to,
      fromFraction,
      toFraction,
    };
    const parts = input.visibleParts(segment);
    validateParts(parts);
    for (const [start, end] of parts) {
      const a = v3.sub(v3.lerp(from, to, start), input.eye);
      const b = v3.sub(v3.lerp(from, to, end), input.eye);
      const la = Math.hypot(a.x, a.y, a.z);
      const lb = Math.hypot(b.x, b.y, b.z);
      if (!finite(la) || !finite(lb)) throw new Error('optical eye-ray coordinate overflow');
      // A contour endpoint at the eye has no direction. A line crossing the eye has no
      // unique angular arc either; the caller's near-plane clipper must resolve that case.
      if (la === 0 || lb === 0) continue;
      const rayA = { x: a.x / la, y: a.y / la, z: a.z / la };
      const rayB = { x: b.x / lb, y: b.y / lb, z: b.z / lb };
      if (v3.dot(rayA, rayB) <= 0 && v3.length(v3.cross(rayA, rayB)) <= 8 * Number.EPSILON)
        continue;
      const fractionA = fromFraction + (toFraction - fromFraction) * start;
      const fractionB = fromFraction + (toFraction - fromFraction) * end;
      segments.push({ from: rayA, to: rayB, depth: 1 - (fractionA + fractionB) / 2 });
    }
  };
  for (let k = 0; k < rings.length; k++) {
    const ring = rings[k]!;
    const fraction = input.stations[k]!;
    for (let i = 0; i < input.azimuthSegments; i++) {
      emit('contour', ring[i]!, ring[(i + 1) % input.azimuthSegments]!, fraction, fraction);
      if (k + 1 < rings.length)
        emit('meridian', ring[i]!, rings[k + 1]![i]!, fraction, input.stations[k + 1]!);
    }
  }
  return segments.length === 0
    ? undefined
    : {
        schema: 'well-optical-v1',
        observedAt: input.observedAt,
        visible: true,
        phase: input.phase,
        brightness: input.brightness,
        segments,
      };
}
