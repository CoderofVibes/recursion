/** A19 display preparation. The producer supplies observed shape; this file defines no
 * force profile, onset schedule, crushing limit or default physical dimensions. */
import { BufferGeometry, Float32BufferAttribute, Group, LineSegments, Vector3 } from 'three';
import type { BelievedField } from '../../../contracts/index.ts';
import type { Vec3 } from '../../../lib/vec3.ts';
import { envelopeStyle, lineStyles, opacity, render } from '../../../theme/index.ts';
import { wellColour, wellLineMaterial } from '../../../theme/three/index.ts';
import { toScene } from '../../adapter.ts';
import type { FieldViewFactory } from '../../fieldViews.ts';
import { setFatSegs } from '../../gfx.ts';
import {
  WELL_VIEW_KIND,
  validWellObservation,
  wellDisplayState,
  type WellObservation,
  type WellEstimate,
} from './evidence.ts';

export interface FunnelStation {
  /** Position along the measured mouth-to-throat axis, 0..1. */
  readonly fraction: number;
  readonly radius: WellEstimate;
}

export interface FunnelGeometryEstimate {
  readonly mouth: Vec3;
  /** Unit vector from mouth toward throat; arbitrary orientation in the briefing frame. */
  readonly axis: Vec3;
  readonly mouthSigma: number;
  readonly axisSigma: number;
  readonly length: WellEstimate;
  readonly mouthRadius: WellEstimate;
  readonly throatRadius: WellEstimate;
  /** Observed contour profile, including fractions 0 and 1. No assumed taper fills it in. */
  readonly stations: readonly FunnelStation[];
}

export interface WellFunnelVisual extends WellObservation {
  readonly schema: 'well-funnel-observation-v2';
  /** Reported visible state; no hidden activation deadline is accepted. */
  readonly phase: 'precursor' | 'active';
  readonly geometry: FunnelGeometryEstimate;
}

const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const nonnegative = (v: unknown): v is number => finite(v) && v >= 0;
const vector = (v: unknown): v is Vec3 => object(v) && finite(v.x) && finite(v.y) && finite(v.z);
const unit = (v: unknown): v is Vec3 =>
  vector(v) && Math.abs(Math.hypot(v.x, v.y, v.z) - 1) <= 1e-6;
const estimate = (v: unknown): v is WellEstimate =>
  object(v) && nonnegative(v.value) && nonnegative(v.sigma);

export function validFunnelGeometry(g: unknown): g is FunnelGeometryEstimate {
  if (
    !object(g) ||
    !vector(g.mouth) ||
    !unit(g.axis) ||
    !nonnegative(g.mouthSigma) ||
    !nonnegative(g.axisSigma) ||
    !estimate(g.length) ||
    g.length.value <= 0 ||
    !estimate(g.mouthRadius) ||
    g.mouthRadius.value <= 0 ||
    !estimate(g.throatRadius) ||
    g.throatRadius.value >= g.mouthRadius.value ||
    !Array.isArray(g.stations) ||
    g.stations.length < 2
  )
    return false;
  let previous = -1;
  for (const s of g.stations) {
    if (
      !object(s) ||
      !nonnegative(s.fraction) ||
      s.fraction > 1 ||
      s.fraction <= previous ||
      !estimate(s.radius)
    )
      return false;
    previous = s.fraction;
  }
  const first = g.stations[0] as FunnelStation;
  const last = g.stations.at(-1) as FunnelStation;
  return (
    first.fraction === 0 &&
    last.fraction === 1 &&
    first.radius.value === g.mouthRadius.value &&
    first.radius.sigma === g.mouthRadius.sigma &&
    last.radius.value === g.throatRadius.value &&
    last.radius.sigma === g.throatRadius.sigma
  );
}

export function readWellFunnelVisual(field: BelievedField): WellFunnelVisual | undefined {
  if (!field.detected || field.kind !== WELL_VIEW_KIND) return undefined;
  const v: unknown = field.visual;
  if (
    !object(v) ||
    v.schema !== 'well-funnel-observation-v2' ||
    !validWellObservation(v) ||
    !validFunnelGeometry(v.geometry) ||
    (v.phase !== 'precursor' && v.phase !== 'active')
  )
    return undefined;
  return v as unknown as WellFunnelVisual;
}

/** Local y is the measured mouth-to-throat direction. Ring phase is a drawing convention;
 * it does not supply roll, a physical field azimuth, or a measured escape direction. */
export function orientedFunnelGeometry(g: FunnelGeometryEstimate): BufferGeometry {
  if (!validFunnelGeometry(g)) throw new Error('invalid acquired funnel geometry');
  const points: number[] = [];
  const colours: number[] = [];
  const append = (s: FunnelStation, angle: number) => {
    points.push(
      s.radius.value * Math.cos(angle),
      s.fraction * g.length.value,
      s.radius.value * Math.sin(angle),
    );
    const colour = wellColour(s.fraction);
    colours.push(colour.r, colour.g, colour.b);
  };
  for (let k = 0; k < g.stations.length; k++) {
    const station = g.stations[k]!;
    for (let i = 0; i < render.well.meridians; i++) {
      const angle = (i / render.well.meridians) * Math.PI * 2;
      append(station, angle);
      append(station, ((i + 1) / render.well.meridians) * Math.PI * 2);
      if (k + 1 < g.stations.length) {
        append(station, angle);
        append(g.stations[k + 1]!, angle);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(points, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colours, 3));
  return geometry;
}

/** Uncertain contour rings at measured stations, not a spherical influence boundary. */
export function funnelUncertaintySegments(g: FunnelGeometryEstimate): number[] {
  const points: number[] = [];
  for (const s of g.stations) {
    const along = s.fraction * g.length.value;
    const transverse = envelopeStyle.sigmas * (g.mouthSigma + s.radius.sigma + along * g.axisSigma);
    const axial = envelopeStyle.sigmas * (g.mouthSigma + s.fraction * g.length.sigma);
    for (const sign of [-1, 1]) {
      const radius = Math.max(0, s.radius.value + sign * transverse);
      for (let i = 0; i < render.well.rings; i++) {
        for (const j of [i, i + 1]) {
          const angle = (j / render.well.rings) * Math.PI * 2;
          points.push(radius * Math.cos(angle), along + sign * axial, radius * Math.sin(angle));
        }
      }
    }
  }
  return points;
}

const LOCAL_AXIS = new Vector3(0, 1, 0);

export const makeFunnelView: FieldViewFactory = ({ group, lines }) => {
  const pose = new Group();
  const wire = new LineSegments(new BufferGeometry(), wellLineMaterial());
  const bounds = lines.fatSegs([], lineStyles.wellBoundary, { order: render.renderOrder.envelope });
  wire.renderOrder = render.renderOrder.onPlane;
  wire.frustumCulled = false;
  pose.add(bounds, wire);
  group.add(pose);
  const axis = new Vector3();
  let cachedShape = '';
  let cachedBounds = '';
  return {
    update(frame) {
      const v = readWellFunnelVisual(frame.field);
      const state = wellDisplayState(v, frame.snapshot.t);
      pose.visible = state === 'current' || state === 'stale';
      wire.visible = state === 'current';
      if (!v || !pose.visible) return;
      const g = v.geometry;
      toScene(g.mouth, pose.position);
      // Acquired unit vectors allow rounding tolerance; Three requires exact normalization,
      // especially near the antiparallel branch of setFromUnitVectors.
      pose.quaternion.setFromUnitVectors(LOCAL_AXIS, toScene(g.axis, axis).normalize());
      pose.userData.phase = v.phase;
      bounds.material.opacity =
        state === 'stale' ? opacity.staleInstrument : lineStyles.wellBoundary.opacity;
      wire.material.opacity =
        v.phase === 'precursor' ? opacity.priorEvidence : lineStyles.wellMouth.opacity;
      // Pose updates belong on the group. Rebuild local buffers only when their shape changes;
      // tracking a new mouth/axis must not upload every contour again for every visible well.
      const shapeKey = JSON.stringify([
        g.length.value,
        g.stations.map((s) => [s.fraction, s.radius.value]),
      ]);
      if (shapeKey !== cachedShape) {
        cachedShape = shapeKey;
        wire.geometry.dispose();
        wire.geometry = orientedFunnelGeometry(g);
      }
      const boundsKey = JSON.stringify([g.length, g.mouthSigma, g.axisSigma, g.stations]);
      if (boundsKey !== cachedBounds) {
        cachedBounds = boundsKey;
        setFatSegs(bounds, funnelUncertaintySegments(g));
      }
    },
    dispose() {
      group.remove(pose);
      wire.geometry.dispose();
      wire.material.dispose();
      bounds.geometry.dispose();
      bounds.material.dispose();
    },
  };
};

/** Optical data needs no known range, rule adoption, or fitted physical field parameters. */
export interface WindowFunnelVisual {
  readonly schema: 'well-optical-v1';
  readonly observedAt: number;
  readonly visible: boolean;
  readonly phase: 'precursor' | 'active';
  /** Inertial unit rays from the eye. Depth only selects the theme's contour colour. */
  readonly segments: readonly { readonly from: Vec3; readonly to: Vec3; readonly depth: number }[];
}

export function readWindowFunnelVisual(v: unknown): WindowFunnelVisual | undefined {
  if (
    !object(v) ||
    v.schema !== 'well-optical-v1' ||
    !finite(v.observedAt) ||
    typeof v.visible !== 'boolean' ||
    (v.phase !== 'precursor' && v.phase !== 'active') ||
    !Array.isArray(v.segments) ||
    v.segments.length === 0 ||
    !v.segments.every(
      (s) => object(s) && unit(s.from) && unit(s.to) && nonnegative(s.depth) && s.depth <= 1,
    )
  )
    return undefined;
  return v as unknown as WindowFunnelVisual;
}

/** The shell radius belongs to the window renderer's presentation, never the well's range.
 * The owner passes optical observations; no fitted FLIGHT geometry is projected into the eye. */
export function makeOpticalFunnelView(group: Group, displayRadius: number) {
  if (!Number.isFinite(displayRadius) || displayRadius <= 0)
    throw new Error('invalid display shell radius');
  const wire = new LineSegments(new BufferGeometry(), wellLineMaterial());
  wire.frustumCulled = false;
  wire.renderOrder = render.renderOrder.onPlane;
  wire.visible = false;
  group.add(wire);
  const point = new Vector3();
  let cached = '';
  return {
    update(input: unknown, t: number) {
      const v = readWindowFunnelVisual(input);
      // An eye frame is instantaneous. Missing/currently occluded data must not persist as sight.
      wire.visible = !!v && v.visible && v.observedAt === t;
      if (!v || !wire.visible) return;
      wire.userData.phase = v.phase;
      wire.material.opacity =
        v.phase === 'precursor' ? opacity.priorEvidence : lineStyles.wellMouth.opacity;
      const key = JSON.stringify(v.segments);
      if (key === cached) return;
      cached = key;
      const points: number[] = [];
      const colours: number[] = [];
      for (const segment of v.segments) {
        const colour = wellColour(segment.depth);
        for (const ray of [segment.from, segment.to]) {
          toScene(ray, point).normalize().multiplyScalar(displayRadius);
          points.push(point.x, point.y, point.z);
          colours.push(colour.r, colour.g, colour.b);
        }
      }
      wire.geometry.dispose();
      wire.geometry = new BufferGeometry();
      wire.geometry.setAttribute('position', new Float32BufferAttribute(points, 3));
      wire.geometry.setAttribute('color', new Float32BufferAttribute(colours, 3));
    },
    dispose() {
      group.remove(wire);
      wire.geometry.dispose();
      wire.material.dispose();
    },
  };
}
