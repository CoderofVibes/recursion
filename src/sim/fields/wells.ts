/**
 * [FICTIONAL] A15/Q01–Q05, S5: a static spherical well modifies net delivered propulsion
 * at the centre of mass. Gravity, velocity and nominal actuator moments are untouched.
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
      return { id: s.id, ...readWellParameters(s) };
    });
  for (let i = 0; i < wells.length; i++) {
    const a = wells[i]!;
    for (let j = i + 1; j < wells.length; j++) {
      const b = wells[j]!;
      if (v3.distance(a.center, b.center) < a.outerRadius + b.outerRadius + minimumGap)
        throw new Error(`wells ${a.id} and ${b.id} overlap or violate the minimum gap`);
    }
  }
}

export interface WellSample {
  readonly radius: number;
  readonly radial: Vec3;
  readonly weight: number;
  readonly radialGain: number;
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
    // Evaluate from the nearer endpoint to avoid cancellation close to the outer edge.
    const u = (parameters.outerRadius - radius) / (parameters.outerRadius - parameters.innerRadius);
    weight = u * u * u * (10 + u * (-15 + 6 * u));
  }
  return { radius, radial: v3.scale(offset, 1 / radius), weight, radialGain: 1 - 2 * weight };
}

export function sampleWell(spec: FieldInstanceSpec, position: Vec3): WellSample {
  return sample(readWellParameters(spec), position);
}

function transformed(force: Vec3, s: WellSample): Vec3 {
  if (!v3.isFinite3(force)) throw new Error('well force must be finite');
  if (s.weight === 0 || v3.lengthSq(force) === 0) return force;
  return v3.addScaled(force, s.radial, -2 * s.weight * v3.dot(force, s.radial));
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

/** Use the exact world's field list here; never compose unvalidated overlapping wells. */
export function createWellRegistry(
  specs: readonly FieldInstanceSpec[],
  minimumGap = 0,
): FieldRegistry {
  validateWellSpecs(specs, minimumGap);
  return createFieldRegistry([wellFactory]);
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
