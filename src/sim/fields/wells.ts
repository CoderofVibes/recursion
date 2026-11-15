/**
 * Historical [FICTIONAL] A15/Q01–Q05, S5: a static sphere modifies net delivered propulsion
 * at the centre of mass. Gravity, velocity and nominal actuator moments are untouched.
 * A19 funnels use the S22 prototype selected by the owner. Shared game code still owns
 * terminal event chronology; prototype numbers remain labelled assumptions, not measurements.
 * Truth only. Neither these parameters nor diagnostic samples are sensor observations.
 */
import type { FieldId } from '../../contracts/ids.ts';
import {
  createFieldRegistry,
  type EnvironmentField,
  type FieldFactory,
  type FieldInstanceSpec,
  type FieldRegistry,
} from '../../contracts/truth/fields.ts';
import type { JsonValue } from '../../contracts/units.ts';
import * as v3 from '../../lib/vec3.ts';
import type { Vec3 } from '../../lib/vec3.ts';

export const WELL_KIND = 'inverse-well';
export const FUNNEL_PROFILE = 's22-funnel-v1';

export type FunnelActivation =
  | { readonly phase: 'initial' }
  | { readonly phase: 'pending' | 'cancelled' }
  | { readonly phase: 'active'; readonly activeSince: number };

export interface FunnelProfile {
  readonly length: number;
  readonly mouthRadius: number;
  readonly throatRadius: number;
  readonly capLength: number;
  readonly radialEdgeMax: number;
  readonly pullMin: number;
  readonly pullMax: number;
  readonly rampDuration: number;
}

/** [ASSUMED: S22 prototype] SI; no lifecycle decisions or scheduled births occur in this module. */
export const DEFAULT_FUNNEL_PROFILE: FunnelProfile = Object.freeze({
  length: 120_000,
  mouthRadius: 20_000,
  throatRadius: 1_000,
  capLength: 5_000,
  radialEdgeMax: 2_000,
  pullMin: 0.02,
  pullMax: 0.1,
  rampDuration: 120,
});
export const DEFAULT_FUNNEL_BOUND_RADIUS = Math.hypot(62_500, 20_000);
export const DEFAULT_FUNNEL_ACCELERATION_BOUND = (24_000 + 40 * 200 + 0.236) / 24_000 + 0.1;

export interface FunnelParameters extends FunnelGeometry, FunnelProfile {
  readonly profile: typeof FUNNEL_PROFILE;
  readonly activation: FunnelActivation;
}
export interface WellProfile {
  readonly innerRadius: number;
  readonly outerRadius: number;
  readonly coreRadius: number;
}
export interface WellParameters extends WellProfile {
  readonly center: Vec3;
}
/** [ASSUMED: A15 starting dimensions] metres; the core needs a physical collision object. */
export const DEFAULT_WELL_PROFILE: WellProfile = Object.freeze({
  innerRadius: 40_000,
  outerRadius: 50_000,
  coreRadius: 1_000,
});

function object(value: JsonValue | undefined): value is { readonly [key: string]: JsonValue } {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function finiteNumber(value: JsonValue | undefined, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error(`well ${name} must be finite`);
  return value;
}

/** Parse and copy JSON so later caller mutation cannot move an instantiated well. */
export function readWellParameters(spec: FieldInstanceSpec): WellParameters {
  if (spec.kind !== WELL_KIND) throw new Error(`expected field kind ${WELL_KIND}`);
  if (!spec.id.trim()) throw new Error('well ID must not be empty');
  const p = spec.params;
  if (!object(p) || !object(p.center)) throw new Error('well params need a center');
  if (p.profile !== undefined)
    throw new Error('legacy sphere params must not claim a versioned funnel profile');
  const center = {
    x: finiteNumber(p.center.x, 'center.x'),
    y: finiteNumber(p.center.y, 'center.y'),
    z: finiteNumber(p.center.z, 'center.z'),
  };
  const coreRadius = finiteNumber(p.coreRadius, 'coreRadius');
  const innerRadius = finiteNumber(p.innerRadius, 'innerRadius');
  const outerRadius = finiteNumber(p.outerRadius, 'outerRadius');
  if (!(0 < coreRadius && coreRadius < innerRadius && innerRadius < outerRadius))
    throw new Error('well radii require 0 < coreRadius < innerRadius < outerRadius');
  return { center, coreRadius, innerRadius, outerRadius };
}

export function wellSpec(
  id: FieldId,
  center: Vec3,
  profile: WellProfile = DEFAULT_WELL_PROFILE,
): FieldInstanceSpec {
  const spec = { id, kind: WELL_KIND, params: { ...profile, center: { ...center } } };
  readWellParameters(spec);
  return spec;
}

/** A15 excludes overlaps. Static centres make this validation valid for the entire flight. */
export function validateWellSpecs(specs: readonly FieldInstanceSpec[], minimumGap = 0): void {
  if (!Number.isFinite(minimumGap) || minimumGap < 0)
    throw new Error('well minimumGap must be finite and nonnegative');
  const ids = new Set<string>();
  const wells = specs
    .filter((s) => s.kind === WELL_KIND)
    .map((s) => {
      if (ids.has(s.id)) throw new Error(`duplicate well ID ${s.id}`);
      ids.add(s.id);
      if (isFunnelSpec(s)) {
        const p = readFunnelParameters(s);
        const half = (p.length + p.capLength) / 2;
        return {
          id: s.id,
          center: v3.addScaled(p.mouth, p.axis, half),
          outerRadius: Math.hypot(half, Math.max(p.mouthRadius, p.throatRadius)),
        };
      }
      return { id: s.id, ...readWellParameters(s) };
    });
  const entries = wells.map((a) => {
    const r = a.outerRadius + minimumGap / 2;
    return {
      id: a.id,
      bounds: {
        min: { x: a.center.x - r, y: a.center.y - r, z: a.center.z - r },
        max: { x: a.center.x + r, y: a.center.y + r, z: a.center.z + r },
      },
    };
  });
  const index = createWellSpatialIndex(entries);
  const byId = new Map(wells.map((a) => [a.id, a]));
  for (let i = 0; i < wells.length; i++) {
    const a = wells[i]!;
    for (const id of index.candidatesInBounds(entries[i]!.bounds)) {
      if (compareId(a.id, id) >= 0) continue;
      const b = byId.get(id)!;
      if (v3.distance(a.center, b.center) < a.outerRadius + b.outerRadius + minimumGap)
        throw new Error(`wells ${a.id} and ${b.id} overlap or violate the minimum gap`);
    }
  }
}

function isFunnelSpec(spec: FieldInstanceSpec): boolean {
  return object(spec.params) && spec.params.profile === FUNNEL_PROFILE;
}

/** Parse the explicit S22 prototype version. The old sphere schema is never inferred as a funnel. */
export function readFunnelParameters(spec: FieldInstanceSpec): FunnelParameters {
  if (spec.kind !== WELL_KIND || !spec.id.trim() || !isFunnelSpec(spec))
    throw new Error(`expected a named ${WELL_KIND} with profile ${FUNNEL_PROFILE}`);
  const p = spec.params as { readonly [key: string]: JsonValue };
  const vector = (value: JsonValue | undefined, name: string): Vec3 => {
    if (!object(value)) throw new Error(`funnel ${name} must be a vector`);
    return {
      x: finiteNumber(value.x, `${name}.x`),
      y: finiteNumber(value.y, `${name}.y`),
      z: finiteNumber(value.z, `${name}.z`),
    };
  };
  const geometry = checkedFunnel({
    mouth: vector(p.mouth, 'mouth'),
    axis: vector(p.axis, 'axis'),
    length: finiteNumber(p.length, 'length'),
    mouthRadius: finiteNumber(p.mouthRadius, 'mouthRadius'),
    throatRadius: finiteNumber(p.throatRadius, 'throatRadius'),
  });
  const capLength = finiteNumber(p.capLength, 'capLength');
  const radialEdgeMax = finiteNumber(p.radialEdgeMax, 'radialEdgeMax');
  const pullMin = finiteNumber(p.pullMin, 'pullMin');
  const pullMax = finiteNumber(p.pullMax, 'pullMax');
  const rampDuration = finiteNumber(p.rampDuration, 'rampDuration');
  if (!(
    geometry.mouthRadius >= geometry.throatRadius &&
    geometry.throatRadius > 0 &&
    capLength > 0 &&
    capLength <= geometry.length &&
    radialEdgeMax > 0 &&
    pullMin >= 0 &&
    pullMax >= pullMin &&
    rampDuration > 0
  ))
    throw new Error('invalid S22 funnel profile dimensions or pull/ramp bounds');
  if (!object(p.activation)) throw new Error('funnel activation snapshot is required');
  const phase = p.activation.phase;
  let activation: FunnelActivation;
  if (phase === 'initial' || phase === 'pending' || phase === 'cancelled') activation = { phase };
  else if (phase === 'active')
    activation = { phase, activeSince: finiteNumber(p.activation.activeSince, 'activeSince') };
  else throw new Error('unknown funnel activation phase');
  return {
    ...geometry,
    profile: FUNNEL_PROFILE,
    capLength,
    radialEdgeMax,
    pullMin,
    pullMax,
    rampDuration,
    activation,
  };
}

export function funnelSpec(
  id: FieldId,
  mouth: Vec3,
  axis: Vec3,
  activation: FunnelActivation = { phase: 'initial' },
  profile: FunnelProfile = DEFAULT_FUNNEL_PROFILE,
): FieldInstanceSpec {
  const spec: FieldInstanceSpec = {
    id,
    kind: WELL_KIND,
    params: {
      ...profile,
      profile: FUNNEL_PROFILE,
      mouth: { ...mouth },
      axis: { ...axis },
      activation: { ...activation },
    },
  };
  readFunnelParameters(spec);
  return spec;
}

const smoothRise = (coordinate: number): number => smoothWellWeight(1 - coordinate);
function activeAt(p: FunnelParameters, t: number): boolean {
  return (
    p.activation.phase === 'initial' ||
    (p.activation.phase === 'active' && t >= p.activation.activeSince)
  );
}

export interface FunnelSample extends FunnelCoordinates {
  readonly radius: number;
  readonly edgeWidth: number;
  readonly spatialWeight: number;
  readonly activationGain: number;
  readonly weight: number;
  readonly pull: Vec3;
  /** Signed point clearance to the throat; geometry alone, even if the site is dormant. */
  readonly crushDistance: number;
  readonly crushActive: boolean;
  /** A live point lies in the absorbing throat. Shared collision code must terminate first. */
  readonly terminal: boolean;
}

function funnelSample(p: FunnelParameters, position: Vec3, t: number): FunnelSample {
  if (!v3.isFinite3(position) || !Number.isFinite(t))
    throw new Error('funnel sample must be finite');
  const d = v3.sub(position, p.mouth);
  const axial = v3.dot(d, p.axis);
  const radial = v3.addScaled(d, p.axis, -axial);
  const radialDistance = Math.hypot(radial.x, radial.y, radial.z);
  const u = Math.min(1, Math.max(0, axial / p.length));
  const radius = p.throatRadius + (p.mouthRadius - p.throatRadius) * (1 - u) ** 2;
  const edgeWidth = Math.min(p.radialEdgeMax, radius / 4);
  const spatialWeight =
    axial <= 0 || axial >= p.length + p.capLength
      ? 0
      : smoothRise(axial / p.capLength) *
        smoothRise((p.length + p.capLength - axial) / p.capLength) *
        smoothRise((radius - radialDistance) / edgeWidth);
  const activationGain =
    p.activation.phase === 'initial'
      ? 1
      : p.activation.phase === 'active'
        ? smoothRise((t - p.activation.activeSince) / p.rampDuration)
        : 0;
  const weight = spatialWeight * activationGain;
  const pull =
    weight === 0
      ? v3.ZERO
      : v3.scale(
          p.axis,
          weight * (p.pullMin + (p.pullMax - p.pullMin) * u * u) * (axial < p.length ? 1 : -1),
        );
  const crushDistance =
    v3.distance(position, v3.addScaled(p.mouth, p.axis, p.length)) - p.throatRadius;
  const crushActive = activeAt(p, t);
  return {
    axial,
    axialFraction: axial / p.length,
    radial,
    radialDistance,
    radius,
    edgeWidth,
    spatialWeight,
    activationGain,
    weight,
    pull,
    crushDistance,
    crushActive,
    terminal: crushActive && crushDistance <= 0,
  };
}

/**
 * [FICTIONAL: S22 prototype] A bounded continuation is returned inside the excluded throat
 * for speculative integrator stages; terminal is explicit. It is not playable interior physics.
 */
export function sampleFunnel(spec: FieldInstanceSpec, position: Vec3, t: number): FunnelSample {
  return funnelSample(readFunnelParameters(spec), position, t);
}

export interface FunnelEvaluation extends FunnelSample, WellPower {
  readonly force: Vec3;
  readonly correction: Vec3;
  readonly pullPower: number;
}

export function evaluateFunnel(
  spec: FieldInstanceSpec,
  force: Vec3,
  position: Vec3,
  velocity: Vec3,
  mass: number,
  t: number,
): FunnelEvaluation {
  if (!v3.isFinite3(velocity) || !Number.isFinite(mass) || mass <= 0)
    throw new Error('funnel work needs finite velocity and positive mass');
  const p = readFunnelParameters(spec);
  const s = funnelSample(p, position, t);
  const applied = applyRadialResponse(force, p.axis, s.weight);
  const correction = v3.sub(applied, force);
  return {
    ...s,
    force: applied,
    correction,
    nominalPower: v3.dot(velocity, force),
    fieldPower: v3.dot(velocity, correction),
    pullPower: mass * v3.dot(velocity, s.pull),
  };
}

export interface FunnelWork extends WellWork {
  readonly pullJ: number;
}
export function accumulateFunnelWork(
  work: FunnelWork,
  start: WellPower & { readonly pullPower: number },
  end: WellPower & { readonly pullPower: number },
  dt: number,
): FunnelWork {
  if (![work.pullJ, start.pullPower, end.pullPower].every(Number.isFinite))
    throw new Error('funnel pull work must be finite');
  return {
    ...accumulateWellWork(work, start, end, dt),
    pullJ: work.pullJ + dt * 0.5 * (start.pullPower + end.pullPower),
  };
}

/** Includes the S22 rear cap. It is only an index envelope, never the support itself. */
export function funnelSupportBounds(spec: FieldInstanceSpec): WellBounds {
  const p = readFunnelParameters(spec);
  return funnelBounds({ ...p, length: p.length + p.capLength });
}

/** All reserved throat candidates, including dormant sites; the narrow helper checks activity. */
export function createFunnelCrushIndex(specs: readonly FieldInstanceSpec[]): WellSpatialIndex {
  return createWellSpatialIndex(
    specs.filter(isFunnelSpec).map((spec) => {
      const p = readFunnelParameters(spec);
      const c = v3.addScaled(p.mouth, p.axis, p.length);
      const r = { x: p.throatRadius, y: p.throatRadius, z: p.throatRadius };
      return { id: spec.id, bounds: { min: v3.sub(c, r), max: v3.add(c, r) } };
    }),
  );
}

export interface FunnelCrushResult {
  readonly active: boolean;
  /** Null means no active absorbing volume during the query. */
  readonly clearance: number | null;
  readonly contact: boolean;
  readonly firstContactFraction?: number;
}

/** Point or enclosing-sphere check; not an exact check of the ship's occupied prisms. */
export function funnelCrushPoint(
  spec: FieldInstanceSpec,
  position: Vec3,
  t: number,
  hullRadius = 0,
): FunnelCrushResult {
  return funnelCrushSegment(spec, position, position, t, t, hullRadius);
}

/**
 * Straight-segment contact with a static throat, clipped to the snapshot's active interval.
 * An enclosing hull sphere is conservative. Curvature, rotation, deployment and earliest
 * event ordering remain the integrator's narrow-phase responsibility.
 */
export function funnelCrushSegment(
  spec: FieldInstanceSpec,
  from: Vec3,
  to: Vec3,
  t0: number,
  t1: number,
  hullRadius = 0,
): FunnelCrushResult {
  const p = readFunnelParameters(spec);
  if (
    !v3.isFinite3(from) ||
    !v3.isFinite3(to) ||
    ![t0, t1, hullRadius].every(Number.isFinite) ||
    t1 < t0 ||
    hullRadius < 0
  )
    throw new Error('funnel crush query needs finite ordered times and nonnegative hull radius');
  if (!activeAt(p, t1)) return { active: false, clearance: null, contact: false };
  const start =
    p.activation.phase === 'active' && p.activation.activeSince > t0
      ? (p.activation.activeSince - t0) / (t1 - t0)
      : 0;
  const center = v3.addScaled(p.mouth, p.axis, p.length);
  const d = v3.sub(to, from);
  const a = v3.lengthSq(d);
  const q = v3.sub(from, center);
  const radius = p.throatRadius + hullRadius;
  const nearest = a === 0 ? start : Math.max(start, Math.min(1, -v3.dot(q, d) / a));
  const clearance = v3.length(v3.addScaled(q, d, nearest)) - radius;
  let firstContactFraction: number | undefined;
  if (v3.lengthSq(v3.addScaled(q, d, start)) <= radius * radius) firstContactFraction = start;
  else if (a > 0) {
    const b = v3.dot(q, d);
    const c = v3.lengthSq(q) - radius * radius;
    const discriminant = b * b - a * c;
    if (discriminant >= 0) {
      const root = Math.sqrt(discriminant);
      const stable = -b - (b < 0 ? -root : root);
      const roots =
        root === 0 ? [-b / a] : stable === 0 ? [0, (-2 * b) / a] : [stable / a, c / stable];
      firstContactFraction = roots.filter((u) => u >= start && u <= 1).sort((a, b) => a - b)[0];
    }
  }
  return {
    active: true,
    clearance,
    contact: firstContactFraction !== undefined,
    ...(firstContactFraction === undefined ? {} : { firstContactFraction }),
  };
}

/** Pure low-level margin. A due-event owner decides once and persists activation or cancellation. */
export function funnelBirthGuard(
  spec: FieldInstanceSpec,
  position: Vec3,
  velocity: Vec3,
  hullRadius: number,
  responseSeconds = 240,
  accelerationBound = DEFAULT_FUNNEL_ACCELERATION_BOUND,
): number {
  const p = readFunnelParameters(spec);
  const half = (p.length + p.capLength) / 2;
  return funnelBirthGuardCenter(
    v3.addScaled(p.mouth, p.axis, half),
    position,
    velocity,
    hullRadius,
    responseSeconds,
    accelerationBound,
    Math.hypot(half, Math.max(p.mouthRadius, p.throatRadius)),
  );
}

export function funnelBirthGuardCenter(
  center: Vec3,
  position: Vec3,
  velocity: Vec3,
  hullRadius: number,
  responseSeconds = 240,
  accelerationBound = DEFAULT_FUNNEL_ACCELERATION_BOUND,
  boundRadius = DEFAULT_FUNNEL_BOUND_RADIUS,
): number {
  if (
    !v3.isFinite3(position) ||
    !v3.isFinite3(velocity) ||
    ![hullRadius, responseSeconds, accelerationBound].every(Number.isFinite) ||
    !v3.isFinite3(center) ||
    !Number.isFinite(boundRadius) ||
    boundRadius < 0 ||
    hullRadius < 0 ||
    responseSeconds < 0 ||
    accelerationBound < 0
  )
    throw new Error('funnel birth guard inputs must be finite and nonnegative');
  return (
    v3.distance(position, center) -
    boundRadius -
    hullRadius -
    v3.length(velocity) * responseSeconds -
    0.5 * accelerationBound * responseSeconds * responseSeconds
  );
}

/** A19/S22 geometry scaffolding only: no force, reversal, visibility or crush law is implied. */
export interface FunnelGeometry {
  readonly mouth: Vec3;
  /** Unit direction from the mouth toward the throat. */
  readonly axis: Vec3;
  readonly length: number;
  readonly mouthRadius: number;
  readonly throatRadius: number;
}

export interface FunnelCoordinates {
  readonly axial: number;
  readonly axialFraction: number;
  readonly radial: Vec3;
  readonly radialDistance: number;
}

export interface WellBounds {
  readonly min: Vec3;
  readonly max: Vec3;
}

function checkedFunnel(geometry: FunnelGeometry): FunnelGeometry {
  const { mouth, axis, length, mouthRadius, throatRadius } = geometry;
  if (
    !v3.isFinite3(mouth) ||
    !v3.isFinite3(axis) ||
    ![length, mouthRadius, throatRadius].every(Number.isFinite)
  )
    throw new Error('funnel geometry must be finite');
  const axisLength = Math.hypot(axis.x, axis.y, axis.z);
  if (Math.abs(axisLength - 1) > 1e-10) throw new Error('funnel axis must be a unit vector');
  if (
    length <= 0 ||
    mouthRadius < 0 ||
    throatRadius < 0 ||
    Math.max(mouthRadius, throatRadius) === 0
  )
    throw new Error('funnel length must be positive and radii nonnegative with nonzero extent');
  return {
    mouth: { ...mouth },
    axis: v3.scale(axis, 1 / axisLength),
    length,
    mouthRadius,
    throatRadius,
  };
}

/** Pure axial/radial coordinates. Deliberately does not decide the taper or an inside predicate. */
export function funnelCoordinates(geometry: FunnelGeometry, position: Vec3): FunnelCoordinates {
  const g = checkedFunnel(geometry);
  if (!v3.isFinite3(position)) throw new Error('funnel position must be finite');
  const offset = v3.sub(position, g.mouth);
  const axial = v3.dot(offset, g.axis);
  const radial = v3.addScaled(offset, g.axis, -axial);
  return {
    axial,
    axialFraction: axial / g.length,
    radial,
    radialDistance: Math.hypot(radial.x, radial.y, radial.z),
  };
}

/**
 * Conservative AABB of an oriented length envelope bounded by the larger endpoint radius.
 * It encloses a linear taper and any sampled taper staying below that radius, but chooses
 * neither as S22's physical profile. A bulging profile must supply a larger explicit bound.
 * This is broad phase only; it is not a whole-hull narrow phase or a throat/crush decision.
 */
export function funnelBounds(geometry: FunnelGeometry): WellBounds {
  const g = checkedFunnel(geometry);
  const end = v3.addScaled(g.mouth, g.axis, g.length);
  const radius = Math.max(g.mouthRadius, g.throatRadius);
  const rounding =
    16 *
    Number.EPSILON *
    Math.max(
      1,
      g.length,
      radius,
      Math.abs(g.mouth.x),
      Math.abs(g.mouth.y),
      Math.abs(g.mouth.z),
      Math.abs(end.x),
      Math.abs(end.y),
      Math.abs(end.z),
    );
  const extent = {
    x: radius * Math.sqrt(Math.max(0, 1 - g.axis.x * g.axis.x)) + rounding,
    y: radius * Math.sqrt(Math.max(0, 1 - g.axis.y * g.axis.y)) + rounding,
    z: radius * Math.sqrt(Math.max(0, 1 - g.axis.z * g.axis.z)) + rounding,
  };
  return checkedBounds({
    min: {
      x: Math.min(g.mouth.x, end.x) - extent.x,
      y: Math.min(g.mouth.y, end.y) - extent.y,
      z: Math.min(g.mouth.z, end.z) - extent.z,
    },
    max: {
      x: Math.max(g.mouth.x, end.x) + extent.x,
      y: Math.max(g.mouth.y, end.y) + extent.y,
      z: Math.max(g.mouth.z, end.z) + extent.z,
    },
  });
}

export interface BoundedWell {
  readonly id: FieldId;
  readonly bounds: WellBounds;
}

export interface WellSpatialIndex {
  readonly size: number;
  /** Inclusive broad-phase candidates, always sorted by stable ID. */
  candidatesAt(position: Vec3): readonly FieldId[];
  candidatesInBounds(bounds: WellBounds): readonly FieldId[];
  /** Inflate every box by padding metres; caller owns curved-path and whole-hull narrow phase. */
  candidatesAlongSegment(from: Vec3, to: Vec3, padding?: number): readonly FieldId[];
}

function checkedBounds(bounds: WellBounds): WellBounds {
  const { min, max } = bounds;
  if (!v3.isFinite3(min) || !v3.isFinite3(max) || min.x > max.x || min.y > max.y || min.z > max.z)
    throw new Error('well bounds must be finite and ordered');
  return { min: { ...min }, max: { ...max } };
}

const compareId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const containsPoint = (b: WellBounds, p: Vec3): boolean =>
  p.x >= b.min.x &&
  p.x <= b.max.x &&
  p.y >= b.min.y &&
  p.y <= b.max.y &&
  p.z >= b.min.z &&
  p.z <= b.max.z;
const intersectsBounds = (a: WellBounds, b: WellBounds): boolean =>
  a.min.x <= b.max.x &&
  a.max.x >= b.min.x &&
  a.min.y <= b.max.y &&
  a.max.y >= b.min.y &&
  a.min.z <= b.max.z &&
  a.max.z >= b.min.z;

interface BoundsNode {
  readonly bounds: WellBounds;
  readonly entries?: readonly BoundedWell[];
  readonly left?: BoundsNode;
  readonly right?: BoundsNode;
}

function boundsTree(entries: readonly BoundedWell[]): BoundsNode | undefined {
  if (entries.length === 0) return undefined;
  const lo = { x: Infinity, y: Infinity, z: Infinity };
  const hi = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const { bounds } of entries) {
    lo.x = Math.min(lo.x, bounds.min.x);
    lo.y = Math.min(lo.y, bounds.min.y);
    lo.z = Math.min(lo.z, bounds.min.z);
    hi.x = Math.max(hi.x, bounds.max.x);
    hi.y = Math.max(hi.y, bounds.max.y);
    hi.z = Math.max(hi.z, bounds.max.z);
  }
  const bounds = { min: lo, max: hi };
  if (entries.length <= 8) return { bounds, entries };
  const span = v3.sub(hi, lo);
  const axis = span.x >= span.y && span.x >= span.z ? 'x' : span.y >= span.z ? 'y' : 'z';
  const sorted = [...entries].sort(
    (a, b) =>
      a.bounds.min[axis] / 2 +
        a.bounds.max[axis] / 2 -
        (b.bounds.min[axis] / 2 + b.bounds.max[axis] / 2) || compareId(a.id, b.id),
  );
  const middle = Math.floor(sorted.length / 2);
  return {
    bounds,
    left: boundsTree(sorted.slice(0, middle)),
    right: boundsTree(sorted.slice(middle)),
  };
}

/** Immutable deterministic AABB tree. No per-well simulation callbacks or truth-side RNG draws. */
export function createWellSpatialIndex(entries: readonly BoundedWell[]): WellSpatialIndex {
  const ids = new Set<string>();
  const copied = entries.map((entry) => {
    if (!entry.id.trim() || ids.has(entry.id))
      throw new Error('well index IDs must be nonempty and distinct');
    ids.add(entry.id);
    return { id: entry.id, bounds: checkedBounds(entry.bounds) };
  });
  const root = boundsTree(copied);
  function query(intersects: (bounds: WellBounds) => boolean): readonly FieldId[] {
    const result: FieldId[] = [];
    function visit(node: BoundsNode | undefined): void {
      if (!node || !intersects(node.bounds)) return;
      if (node.entries) {
        for (const entry of node.entries) if (intersects(entry.bounds)) result.push(entry.id);
      } else {
        visit(node.left);
        visit(node.right);
      }
    }
    visit(root);
    return result.sort(compareId);
  }
  return {
    size: copied.length,
    candidatesAt(position) {
      if (!v3.isFinite3(position)) throw new Error('well query position must be finite');
      return query((bounds) => containsPoint(bounds, position));
    },
    candidatesInBounds(bounds) {
      const checked = checkedBounds(bounds);
      return query((candidate) => intersectsBounds(candidate, checked));
    },
    candidatesAlongSegment(from, to, padding = 0) {
      if (!v3.isFinite3(from) || !v3.isFinite3(to) || !Number.isFinite(padding) || padding < 0)
        throw new Error('well segment query must be finite with nonnegative padding');
      const delta = v3.sub(to, from);
      return query((bounds) => {
        let enter = 0;
        let leave = 1;
        for (const axis of ['x', 'y', 'z'] as const) {
          const lo = bounds.min[axis] - padding;
          const hi = bounds.max[axis] + padding;
          if (delta[axis] === 0) {
            if (from[axis] < lo || from[axis] > hi) return false;
          } else {
            const a = (lo - from[axis]) / delta[axis];
            const b = (hi - from[axis]) / delta[axis];
            enter = Math.max(enter, Math.min(a, b));
            leave = Math.min(leave, Math.max(a, b));
            if (enter > leave) return false;
          }
        }
        return true;
      });
    },
  };
}

export interface WellSample {
  readonly radius: number;
  readonly radial: Vec3;
  readonly weight: number;
  readonly radialGain: number;
}

/** C2 edge weight: coordinate 0 is full response, 1 is ordinary; finite values outside clamp. */
export function smoothWellWeight(normalizedEdgeCoordinate: number): number {
  if (!Number.isFinite(normalizedEdgeCoordinate))
    throw new Error('well edge coordinate must be finite');
  if (normalizedEdgeCoordinate <= 0) return 1;
  if (normalizedEdgeCoordinate >= 1) return 0;
  const u = 1 - normalizedEdgeCoordinate;
  // Roundoff near the full edge must not produce a gain just above one.
  return Math.max(0, Math.min(1, u * u * u * (10 + u * (-15 + 6 * u))));
}

/**
 * Shape-independent I - 2w eeᵀ response. Caller chooses the supported direction/profile.
 * Both tangents remain ordinary and the force norm cannot grow for 0 <= w <= 1.
 * This force-only operation adds no torque and does not select any A19 funnel physics.
 */
export function applyRadialResponse(force: Vec3, unitDirection: Vec3, weight: number): Vec3 {
  if (!v3.isFinite3(force) || !v3.isFinite3(unitDirection))
    throw new Error('well response vectors must be finite');
  if (!Number.isFinite(weight) || weight < 0 || weight > 1)
    throw new Error('well response weight must lie in [0,1]');
  const length = Math.hypot(unitDirection.x, unitDirection.y, unitDirection.z);
  if (Math.abs(length - 1) > 1e-10)
    throw new Error('well response direction must be a unit vector');
  if (weight === 0 || v3.lengthSq(force) === 0) return force;
  const e = length === 1 ? unitDirection : v3.scale(unitDirection, 1 / length);
  return v3.addScaled(force, e, -2 * weight * v3.dot(force, e));
}

function sample(parameters: WellParameters, position: Vec3): WellSample {
  if (!v3.isFinite3(position)) throw new Error('well position must be finite');
  const offset = v3.sub(position, parameters.center);
  const radius = Math.hypot(offset.x, offset.y, offset.z);
  if (radius <= parameters.coreRadius)
    throw new Error('ship is at or inside an excluded well core; resolve physical contact first');
  let weight: number;
  if (radius <= parameters.innerRadius) weight = 1;
  else if (radius >= parameters.outerRadius) weight = 0;
  else {
    weight = smoothWellWeight(
      (radius - parameters.innerRadius) / (parameters.outerRadius - parameters.innerRadius),
    );
  }
  return { radius, radial: v3.scale(offset, 1 / radius), weight, radialGain: 1 - 2 * weight };
}

export function sampleWell(spec: FieldInstanceSpec, position: Vec3): WellSample {
  return sample(readWellParameters(spec), position);
}

function transformed(force: Vec3, s: WellSample): Vec3 {
  return applyRadialResponse(force, s.radial, s.weight);
}

export interface WellPower {
  readonly nominalPower: number;
  readonly fieldPower: number;
}
export interface WellEvaluation extends WellSample, WellPower {
  readonly force: Vec3;
  readonly correction: Vec3;
}

/** Signed mechanical power in the caller's inertial frame; never a fuel, charge or heat credit. */
export function evaluateWell(
  spec: FieldInstanceSpec,
  force: Vec3,
  position: Vec3,
  velocity: Vec3,
): WellEvaluation {
  if (!v3.isFinite3(velocity)) throw new Error('well velocity must be finite');
  const s = sampleWell(spec, position);
  const applied = transformed(force, s);
  const correction = v3.sub(applied, force);
  return {
    ...s,
    force: applied,
    correction,
    nominalPower: v3.dot(velocity, force),
    fieldPower: v3.dot(velocity, correction),
  };
}

export interface WellWork {
  readonly nominalJ: number;
  readonly fieldJ: number;
}

/**
 * Pure trapezoidal diagnostic accumulator. The simulation owner must supply actual stage
 * powers and persist the result; a field callback must not mutate a hidden work counter.
 * Convergence must be checked at the caller's step size. Variable-mass energy balances also
 * require the removed mass's kinetic/potential energy; this is not an exhaust-energy ledger.
 */
export function accumulateWellWork(
  work: WellWork,
  start: WellPower,
  end: WellPower,
  dt: number,
): WellWork {
  if (
    ![
      work.nominalJ,
      work.fieldJ,
      start.nominalPower,
      start.fieldPower,
      end.nominalPower,
      end.fieldPower,
      dt,
    ].every(Number.isFinite) ||
    dt < 0
  )
    throw new Error('well work samples must be finite with nonnegative dt');
  return {
    nominalJ: work.nominalJ + 0.5 * dt * (start.nominalPower + end.nominalPower),
    fieldJ: work.fieldJ + 0.5 * dt * (start.fieldPower + end.fieldPower),
  };
}

export const wellFactory: FieldFactory = {
  kind: WELL_KIND,
  create(spec): EnvironmentField {
    const p = readWellParameters(spec);
    return {
      id: spec.id,
      kind: WELL_KIND,
      modifyThrust: (force, position) => transformed(force, sample(p, position)),
      inside: (position) => v3.distance(position, p.center) < p.outerRadius,
    };
  },
};

/**
 * Use the exact world's field list here; never compose unvalidated overlapping wells.
 * One canonical leader dispatches through an index. Followers retain JSON IDs and inside
 * geometry, but have no modifyThrust hook, so the simulation has ONE thrust callback.
 * Versioned S22 funnels add one acceleration callback on that same leader. Both callback
 * families use immutable activation snapshots; rebuilding is the lifecycle owner's job.
 */
export function createWellRegistry(
  specs: readonly FieldInstanceSpec[],
  minimumGap = 0,
): FieldRegistry {
  validateWellSpecs(specs, minimumGap);
  const read = (spec: FieldInstanceSpec): WellParameters | FunnelParameters =>
    isFunnelSpec(spec) ? readFunnelParameters(spec) : readWellParameters(spec);
  const isFunnel = (p: WellParameters | FunnelParameters): p is FunnelParameters => 'profile' in p;
  const wells = specs
    .filter((spec) => spec.kind === WELL_KIND)
    .map((spec) => ({ id: spec.id, parameters: read(spec) }))
    .sort((a, b) => compareId(a.id, b.id));
  const byId = new Map(wells.map((well) => [well.id, well.parameters]));
  const index = createWellSpatialIndex(
    wells.map(({ id, parameters: p }) => ({
      id,
      bounds: isFunnel(p)
        ? funnelBounds({ ...p, length: p.length + p.capLength })
        : {
            min: {
              x: p.center.x - p.outerRadius,
              y: p.center.y - p.outerRadius,
              z: p.center.z - p.outerRadius,
            },
            max: {
              x: p.center.x + p.outerRadius,
              y: p.center.y + p.outerRadius,
              z: p.center.z + p.outerRadius,
            },
          },
    })),
  );
  const leader = wells[0]?.id;
  const dispatch = (force: Vec3, position: Vec3, _velocity: Vec3, t: number): Vec3 => {
    if (!v3.isFinite3(force) || !Number.isFinite(t))
      throw new Error('well force/time must be finite');
    for (const id of index.candidatesAt(position)) {
      const p = byId.get(id)!;
      if (isFunnel(p)) {
        const s = funnelSample(p, position, t);
        if (s.weight > 0) return applyRadialResponse(force, p.axis, s.weight);
      } else if (v3.distance(position, p.center) <= p.outerRadius)
        return transformed(force, sample(p, position));
    }
    return force;
  };
  const pull = (position: Vec3, t: number): Vec3 => {
    if (!Number.isFinite(t)) throw new Error('well time must be finite');
    for (const id of index.candidatesAt(position)) {
      const p = byId.get(id)!;
      if (isFunnel(p)) {
        const s = funnelSample(p, position, t);
        if (s.weight > 0) return s.pull;
      }
    }
    return v3.ZERO;
  };
  const hasPull = wells.some(({ parameters }) => isFunnel(parameters));
  return createFieldRegistry([
    {
      kind: WELL_KIND,
      create(spec) {
        const p = read(spec);
        const expected = byId.get(spec.id);
        if (!expected || JSON.stringify(p) !== JSON.stringify(expected))
          throw new Error(
            'well spec does not match the indexed registry; rebuild from the exact world fields',
          );
        return {
          id: spec.id,
          kind: WELL_KIND,
          inside: (position: Vec3, t: number) =>
            isFunnel(expected)
              ? funnelSample(expected, position, t).weight > 0
              : v3.distance(position, expected.center) < expected.outerRadius,
          ...(spec.id === leader
            ? { modifyThrust: dispatch, ...(hasPull ? { acceleration: pull } : {}) }
            : {}),
        };
      },
    },
  ]);
}

export interface WellCrossing {
  readonly field: FieldId;
  readonly surface: 'core' | 'inner' | 'zero-response' | 'outer';
  /** Fraction along the supplied straight segment, in (0,1]. */
  readonly fraction: number;
  readonly direction: 'inbound' | 'outbound' | 'touch';
}

/**
 * Exact intersections of a straight segment with all four spheres, including two crossings
 * when both ends are outside. (0,1] assigns endpoint events once across adjacent segments.
 * This is a geometric diagnostic, NOT a curved-trajectory collision or event solver. The
 * retained simulation owner must bound curvature/subdivide before using it for flight events.
 */
export function segmentWellCrossings(
  spec: FieldInstanceSpec,
  from: Vec3,
  to: Vec3,
): readonly WellCrossing[] {
  const p = readWellParameters(spec);
  if (!v3.isFinite3(from) || !v3.isFinite3(to)) throw new Error('well segment must be finite');
  const d = v3.sub(to, from);
  const a = v3.lengthSq(d);
  if (a === 0) return [];
  const x = v3.sub(from, p.center);
  const b = v3.dot(x, d);
  const result: WellCrossing[] = [];
  const surfaces: readonly [WellCrossing['surface'], number][] = [
    ['core', p.coreRadius],
    ['inner', p.innerRadius],
    ['zero-response', (p.innerRadius + p.outerRadius) / 2],
    ['outer', p.outerRadius],
  ];
  for (const [surface, radius] of surfaces) {
    const c = v3.lengthSq(x) - radius * radius;
    const discriminant = b * b - a * c;
    if (discriminant < 0) continue;
    const root = Math.sqrt(discriminant);
    // Stable quadratic roots: avoid subtracting near-equal values at an endpoint.
    const q = -b - (b < 0 ? -root : root);
    const roots = root === 0 ? [-b / a] : q === 0 ? [0, (-2 * b) / a] : [q / a, c / q];
    for (const fraction of roots) {
      if (fraction <= 0 || fraction > 1) continue;
      const derivative = b + a * fraction;
      result.push({
        field: spec.id,
        surface,
        fraction,
        direction: root === 0 ? 'touch' : derivative < 0 ? 'inbound' : 'outbound',
      });
    }
  }
  return result.sort((a, b) => a.fraction - b.fraction || a.surface.localeCompare(b.surface));
}
