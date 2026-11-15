/**
 * TRUTH ONLY. [FICTIONAL: brief §6, A16] Finite radiation strands and raw component exposure.
 * S5's compact quartic is in fictional U and U s, never an SI radiation-dose claim.
 * Damage, susceptibility, power trips and recorder reconstruction belong to their owners.
 */
import type { HullPrism } from '../../contracts/ship.ts';
import type { EnvironmentField, FieldFactory } from '../../contracts/truth/fields.ts';
import type { Quat } from '../../lib/quat.ts';
import { rotate, rotateInverse } from '../../lib/quat.ts';
import type { Vec3 } from '../../lib/vec3.ts';
import { add, sub, scale, dot, distance, length, lerp, cross } from '../../lib/vec3.ts';
import { createPrismResult, packPrism, pointPrism } from '../geometry.ts';

export interface LatticeStrand {
  readonly id: string;
  readonly a: Vec3;
  readonly b: Vec3;
}
export interface LatticeLayer {
  readonly id: string;
  readonly strands: readonly LatticeStrand[];
  readonly radius: number;
  readonly peakIntensity: number;
}
export interface LatticeParameters {
  readonly layers: readonly LatticeLayer[];
}
export interface LatticeField extends EnvironmentField {
  readonly kind: 'lattice';
  readonly layers: readonly LatticeLayer[];
  intensity(position: Vec3, t?: number): number;
}
export interface LatticeGrid {
  readonly id: string;
  readonly center: Vec3;
  /** Orthonormal in-plane axes, any orientation in 3D. */
  readonly u: Vec3;
  readonly v: Vec3;
  readonly halfU: number;
  readonly halfV: number;
  readonly pitchU: number;
  readonly pitchV: number;
  readonly phaseU?: number;
  readonly phaseV?: number;
  readonly radius: number;
  readonly peakIntensity: number;
}

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const finiteVector = (v: Vec3) => v && [v.x, v.y, v.z].every(Number.isFinite);
function positive(n: number, name: string): void {
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${name} must be finite and positive`);
}
/** A clipped grid, including a finite endpoint cap. Nothing repeats beyond the patch. */
export function createLatticeLayer(grid: LatticeGrid): LatticeLayer {
  for (const name of ['halfU', 'halfV', 'pitchU', 'pitchV', 'radius'] as const)
    positive(grid[name], name);
  if (
    !finiteVector(grid.center) ||
    !finiteVector(grid.u) ||
    !finiteVector(grid.v) ||
    Math.abs(length(grid.u) - 1) > 1e-10 ||
    Math.abs(length(grid.v) - 1) > 1e-10 ||
    Math.abs(dot(grid.u, grid.v)) > 1e-10
  )
    throw new Error('lattice grid needs an orthonormal 3D basis');
  const strands: LatticeStrand[] = [];
  const world = (u: number, v: number) => add(grid.center, add(scale(grid.u, u), scale(grid.v, v)));
  const lines = (half: number, pitch: number, phase: number) => {
    if (!Number.isFinite(phase)) throw new Error('lattice phase must be finite');
    const lo = Math.ceil((-half - phase) / pitch);
    const hi = Math.floor((half - phase) / pitch);
    if (hi - lo > 10000) throw new Error('lattice grid exceeds strand budget');
    return Array.from({ length: Math.max(0, hi - lo + 1) }, (_, i) => phase + (lo + i) * pitch);
  };
  for (const [i, u] of lines(grid.halfU, grid.pitchU, grid.phaseU ?? 0).entries())
    strands.push({ id: `${grid.id}:u:${i}`, a: world(u, -grid.halfV), b: world(u, grid.halfV) });
  for (const [i, v] of lines(grid.halfV, grid.pitchV, grid.phaseV ?? 0).entries())
    strands.push({ id: `${grid.id}:v:${i}`, a: world(-grid.halfU, v), b: world(grid.halfU, v) });
  return { id: grid.id, strands, radius: grid.radius, peakIntensity: grid.peakIntensity };
}

export function pointSegmentDistance(point: Vec3, a: Vec3, b: Vec3): number {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    dz = b.z - a.z;
  const px = point.x - a.x,
    py = point.y - a.y,
    pz = point.z - a.z;
  const d2 = dx * dx + dy * dy + dz * dz;
  const t = d2 > 0 ? clamp((px * dx + py * dy + pz * dz) / d2) : 0;
  return Math.hypot(px - t * dx, py - t * dy, pz - t * dz);
}
/** S5: nearest strand within one sheet; separate sheets add in canonical ID order. */
export function latticeIntensity(layers: readonly LatticeLayer[], point: Vec3): number {
  let sum = 0;
  for (const layer of layers) {
    if (layerDistanceBound(layer, { center: point, radius: 0 }) >= layer.radius) continue;
    let d = Infinity;
    for (const strand of layer.strands)
      d = Math.min(d, pointSegmentDistance(point, strand.a, strand.b));
    sum += intensityAtDistance(layer, d);
  }
  return sum;
}
function intensityAtDistance(layer: LatticeLayer, d: number): number {
  const q = Math.max(0, 1 - (d / layer.radius) ** 2);
  return layer.peakIntensity * q ** 4;
}
export function createLatticeField(id: string, params: LatticeParameters): LatticeField {
  if (!Array.isArray(params?.layers)) throw new Error('lattice params need layers');
  const ids = new Set<string>();
  const layers: readonly LatticeLayer[] = [...params.layers]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((layer: LatticeLayer) => {
      if (!layer.id || ids.has(layer.id)) throw new Error('lattice layer IDs must be unique');
      ids.add(layer.id);
      positive(layer.radius, 'lattice radius');
      if (!Number.isFinite(layer.peakIntensity) || layer.peakIntensity < 0)
        throw new Error('invalid lattice peak');
      const strandIds = new Set<string>();
      const strands = [...layer.strands]
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .map((strand) => {
          if (
            !strand.id ||
            strandIds.has(strand.id) ||
            !finiteVector(strand.a) ||
            !finiteVector(strand.b)
          )
            throw new Error('invalid lattice strand');
          strandIds.add(strand.id);
          return Object.freeze({
            ...strand,
            a: Object.freeze({ ...strand.a }),
            b: Object.freeze({ ...strand.b }),
          });
        });
      return Object.freeze({ ...layer, strands: Object.freeze(strands) });
    });
  const scene = {
    kind: 'lattice-scene-v1',
    segments: layers.flatMap((layer) =>
      layer.strands.map(({ a, b }) => ({ a: { ...a }, b: { ...b } })),
    ),
  };
  return Object.freeze({
    id,
    kind: 'lattice' as const,
    layers: Object.freeze(layers),
    intensity: (point: Vec3) => latticeIntensity(layers, point),
    // Truth-only raw source for the powered acquisition adapter; never pass this scene to belief.
    signal: () => scene,
    inside: (point: Vec3) =>
      layers.some((layer) =>
        layer.strands.some(
          (strand) => pointSegmentDistance(point, strand.a, strand.b) < layer.radius,
        ),
      ),
  });
}
export const latticeFieldFactory: FieldFactory = {
  kind: 'lattice',
  create: (spec) => createLatticeField(spec.id, spec.params as unknown as LatticeParameters),
};

/** Compact equipment may explicitly use a point; appendages use their real current prism. */
export type LatticeShape =
  | { readonly kind: 'point'; readonly point: Vec3 }
  | { readonly kind: 'prism'; readonly prism: HullPrism }
  /** Reference fixtures and explicitly declared rounded geometry, never an implicit hull replacement. */
  | { readonly kind: 'capsule'; readonly a: Vec3; readonly b: Vec3; readonly radius: number };
export interface LatticeComponent {
  readonly id: string;
  readonly shapes: readonly LatticeShape[];
}
export interface LatticePose {
  readonly position: Vec3;
  readonly attitude: Quat;
  readonly centerOfMass: Vec3;
  /** Actual occupied shapes at this instant; a jammed appendage keeps its intermediate shape. */
  readonly components: readonly LatticeComponent[];
}
interface Closest {
  readonly distance: number;
  readonly componentPoint: Vec3;
}

/** Exact closest pair for finite segments, including parallel and degenerate ones. */
export function closestSegments(
  a: Vec3,
  b: Vec3,
  c: Vec3,
  d: Vec3,
): { distance: number; first: Vec3; second: Vec3 } {
  const u = sub(b, a),
    v = sub(d, c),
    w = sub(a, c);
  const aa = dot(u, u),
    bb = dot(u, v),
    cc = dot(v, v),
    dd = dot(u, w),
    ee = dot(v, w);
  let best = Infinity,
    bestS = 0,
    bestT = 0;
  const consider = (s: number, t: number) => {
    const dx = w.x + u.x * s - v.x * t;
    const dy = w.y + u.y * s - v.y * t;
    const dz = w.z + u.z * s - v.z * t;
    const sq = dx * dx + dy * dy + dz * dz;
    if (sq < best) {
      best = sq;
      bestS = s;
      bestT = t;
    }
  };
  consider(0, cc > 0 ? clamp(ee / cc) : 0);
  consider(1, cc > 0 ? clamp((ee + bb) / cc) : 0);
  consider(aa > 0 ? clamp(-dd / aa) : 0, 0);
  consider(aa > 0 ? clamp((bb - dd) / aa) : 0, 1);
  // Cross-product determinant avoids catastrophic cancellation for nearly parallel strands.
  const uv = cross(u, v),
    determinant = dot(uv, uv);
  if (determinant > 0) {
    const s = dot(cross(v, w), uv) / determinant;
    const t = dot(cross(u, w), uv) / determinant;
    if (s >= 0 && s <= 1 && t >= 0 && t <= 1) consider(s, t);
  }
  return { distance: Math.sqrt(best), first: lerp(a, b, bestS), second: lerp(c, d, bestT) };
}

/** Segment versus the whole convex solid, including a strand through a face interior. */
export function segmentPrismDistance(a: Vec3, b: Vec3, prism: HullPrism): Closest {
  if (prism.outline.length < 3 || prism.zMax < prism.zMin)
    throw new Error('invalid component prism');
  const delta = sub(b, a);
  let lo = 0,
    hi = 1;
  const clip = (value: number, rate: number) => {
    if (rate === 0) {
      if (value < 0) hi = -1;
    } else if (rate > 0) lo = Math.max(lo, -value / rate);
    else hi = Math.min(hi, -value / rate);
  };
  clip(a.z - prism.zMin, delta.z);
  clip(prism.zMax - a.z, -delta.z);
  for (let i = 0; i < prism.outline.length; i++) {
    const p = prism.outline[i]!,
      q = prism.outline[(i + 1) % prism.outline.length]!;
    clip(
      (q.x - p.x) * (a.y - p.y) - (q.y - p.y) * (a.x - p.x),
      (q.x - p.x) * delta.y - (q.y - p.y) * delta.x,
    );
  }
  if (lo <= hi) return { distance: 0, componentPoint: lerp(a, b, (lo + hi) / 2) };
  const packed = packPrism(prism.outline, prism.zMin, prism.zMax);
  const out = createPrismResult();
  let best = Infinity,
    componentPoint = a;
  for (const p of [a, b]) {
    pointPrism(p.x, p.y, p.z, packed, out);
    if (out.distance < best) {
      best = Math.max(0, out.distance);
      componentPoint = { x: out.qx, y: out.qy, z: out.qz };
    }
  }
  const edge = (c: Vec3, d: Vec3) => {
    const r = closestSegments(a, b, c, d);
    if (r.distance < best) {
      best = r.distance;
      componentPoint = r.second;
    }
  };
  for (let i = 0; i < prism.outline.length; i++) {
    const p = prism.outline[i]!,
      q = prism.outline[(i + 1) % prism.outline.length]!;
    for (const z of [prism.zMin, prism.zMax]) edge({ ...p, z }, { ...q, z });
    edge({ ...p, z: prism.zMin }, { ...p, z: prism.zMax });
  }
  return { distance: best, componentPoint };
}
function shapeDistance(shape: LatticeShape, a: Vec3, b: Vec3): Closest {
  if (shape.kind === 'prism') return segmentPrismDistance(a, b, shape.prism);
  if (shape.kind === 'point')
    return { distance: pointSegmentDistance(shape.point, a, b), componentPoint: shape.point };
  const pair = closestSegments(shape.a, shape.b, a, b);
  return {
    distance: Math.max(0, pair.distance - shape.radius),
    componentPoint:
      pair.distance > 0
        ? add(
            pair.first,
            scale(sub(pair.second, pair.first), Math.min(1, shape.radius / pair.distance)),
          )
        : pair.first,
  };
}

export interface ComponentIntensity {
  readonly component: string;
  /** Geometric clearance to any tube, independent of electrical susceptibility. */
  readonly clearance: number;
  /** Lower and upper enclosure of sup_x sum_layer I_layer(x). Never a sum of maxima presented as dose. */
  readonly lower: number;
  readonly upper: number;
  readonly resolved: boolean;
  readonly witness: Vec3 | null;
}
export interface SpatialOptions {
  readonly intensityTolerance?: number;
  readonly maxCells?: number;
}
function worldPoint(pose: LatticePose, p: Vec3): Vec3 {
  return add(pose.position, rotate(pose.attitude, sub(p, pose.centerOfMass)));
}
function bodyPoint(pose: LatticePose, p: Vec3): Vec3 {
  return add(pose.centerOfMass, rotateInverse(pose.attitude, sub(p, pose.position)));
}

interface ShapeSphere {
  center: Vec3;
  radius: number;
}
function shapeSphere(shape: LatticeShape): ShapeSphere {
  if (shape.kind === 'point') return { center: shape.point, radius: 0 };
  if (shape.kind === 'capsule')
    return {
      center: lerp(shape.a, shape.b, 0.5),
      radius: distance(shape.a, shape.b) / 2 + shape.radius,
    };
  const p = shape.prism;
  const center = { x: 0, y: 0, z: (p.zMin + p.zMax) / 2 };
  for (const vertex of p.outline) {
    center.x += vertex.x / p.outline.length;
    center.y += vertex.y / p.outline.length;
  }
  return {
    center,
    radius: Math.max(...p.outline.map((vertex) => distance(center, { ...vertex, z: p.zMax }))),
  };
}
// Poses are immutable values. Every component in a sweep shares one transformed strand scene.
const localScenes = new WeakMap<LatticePose, WeakMap<LatticeField, readonly LatticeLayer[]>>();
const layerBounds = new WeakMap<LatticeLayer, { min: Vec3; max: Vec3 }>();
function layerDistanceBound(layer: LatticeLayer, sphere: ShapeSphere): number {
  let bounds = layerBounds.get(layer);
  if (!bounds) {
    const min = { x: Infinity, y: Infinity, z: Infinity },
      max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const strand of layer.strands)
      for (const p of [strand.a, strand.b]) {
        min.x = Math.min(min.x, p.x);
        min.y = Math.min(min.y, p.y);
        min.z = Math.min(min.z, p.z);
        max.x = Math.max(max.x, p.x);
        max.y = Math.max(max.y, p.y);
        max.z = Math.max(max.z, p.z);
      }
    bounds = { min, max };
    layerBounds.set(layer, bounds);
  }
  if (layer.strands.length === 0) return Infinity;
  return (
    Math.hypot(
      Math.max(0, bounds.min.x - sphere.center.x, sphere.center.x - bounds.max.x),
      Math.max(0, bounds.min.y - sphere.center.y, sphere.center.y - bounds.max.y),
      Math.max(0, bounds.min.z - sphere.center.z, sphere.center.z - bounds.max.z),
    ) - sphere.radius
  );
}
function localLayers(field: LatticeField, pose: LatticePose): readonly LatticeLayer[] {
  let scenes = localScenes.get(pose);
  if (!scenes) {
    scenes = new WeakMap();
    localScenes.set(pose, scenes);
  }
  let local = scenes.get(field);
  if (!local) {
    local = field.layers.map((layer) => ({
      ...layer,
      strands: layer.strands.map((s) => ({
        ...s,
        a: bodyPoint(pose, s.a),
        b: bodyPoint(pose, s.b),
      })),
    }));
    scenes.set(field, local);
  }
  return local;
}

/** Evaluate component volume, not its centre or corners. Mixed-sheet maxima are spatially bounded. */
export function sampleLatticeComponent(
  field: LatticeField,
  pose: LatticePose,
  component: LatticeComponent,
  options: SpatialOptions = {},
): ComponentIntensity {
  if (component.shapes.length === 0) throw new Error('component needs occupied geometry');
  if (options.intensityTolerance !== undefined)
    positive(options.intensityTolerance, 'spatial intensity tolerance');
  if (
    options.maxCells !== undefined &&
    (!Number.isInteger(options.maxCells) || options.maxCells < 1)
  )
    throw new Error('spatial budget must be a positive integer');
  // Installed compact assemblies use their declared mount point. Their maximum is exact,
  // requiring neither a transformed strand scene nor a spatial branch-and-bound search.
  if (component.shapes.length === 1 && component.shapes[0]!.kind === 'point') {
    const witness = worldPoint(pose, component.shapes[0]!.point);
    let clearance = Infinity,
      intensity = 0;
    for (const layer of field.layers) {
      const bound = layerDistanceBound(layer, { center: witness, radius: 0 });
      if (bound >= layer.radius && bound - layer.radius >= clearance) continue;
      let nearest = Infinity;
      for (const strand of layer.strands)
        nearest = Math.min(nearest, pointSegmentDistance(witness, strand.a, strand.b));
      clearance = Math.min(clearance, nearest - layer.radius);
      intensity += intensityAtDistance(layer, nearest);
    }
    return {
      component: component.id,
      clearance,
      lower: intensity,
      upper: intensity,
      resolved: true,
      witness: intensity > 0 ? witness : null,
    };
  }
  const tolerance = options.intensityTolerance ?? 1e-6;
  const maxCells = options.maxCells ?? 4096;
  const local = localLayers(field, pose);
  let clearance = Infinity,
    lower = 0,
    witness: Vec3 | null = null;
  const cells: { shape: LatticeShape; upper: number }[] = [];
  const splitWeights = new WeakMap<LatticeShape, readonly number[]>();
  const bound = (shape: LatticeShape, root: boolean): number => {
    let upper = 0;
    const sphere = shapeSphere(shape);
    for (const layer of local) {
      const distanceBound = layerDistanceBound(layer, sphere);
      if (distanceBound >= layer.radius && (!root || distanceBound - layer.radius >= clearance))
        continue;
      let nearest = Infinity,
        point: Vec3 | undefined;
      let first: LatticeStrand | undefined,
        firstBound = Infinity;
      for (const strand of layer.strands) {
        const bound = pointSegmentDistance(sphere.center, strand.a, strand.b) - sphere.radius;
        if (bound < firstBound) {
          firstBound = bound;
          first = strand;
        }
      }
      if (first) {
        const r = shapeDistance(shape, first.a, first.b);
        nearest = r.distance;
        point = r.componentPoint;
      }
      for (const strand of layer.strands) {
        if (strand === first) continue;
        // A sphere only rejects candidates; the final distance always uses the actual solid.
        if (pointSegmentDistance(sphere.center, strand.a, strand.b) - sphere.radius > nearest)
          continue;
        const r = shapeDistance(shape, strand.a, strand.b);
        if (r.distance < nearest) {
          nearest = r.distance;
          point = r.componentPoint;
        }
      }
      if (root) clearance = Math.min(clearance, nearest - layer.radius);
      upper += intensityAtDistance(layer, nearest);
      if (point && nearest < layer.radius) {
        const value = latticeIntensity(local, point);
        if (value > lower) {
          lower = value;
          witness = worldPoint(pose, point);
        }
      }
    }
    if (upper - lower > tolerance && shape.kind === 'prism') {
      const smooth = smoothPrismUpper(local, shape.prism, sphere);
      if (smooth) {
        upper = Math.min(upper, Math.max(lower, smooth.upper));
        splitWeights.set(shape, smooth.weights);
      }
    }
    return upper;
  };
  for (const shape of component.shapes) cells.push({ shape, upper: bound(shape, true) });
  let count = cells.length;
  while (cells.length > 0 && count < maxCells) {
    let best = 0;
    for (let i = 1; i < cells.length; i++) if (cells[i]!.upper > cells[best]!.upper) best = i;
    const cell = cells[best]!;
    if (cell.upper - lower <= tolerance) break;
    const children = splitShape(cell.shape, splitWeights.get(cell.shape));
    if (!children) break;
    cells.splice(best, 1);
    for (const shape of children) {
      const upper = bound(shape, false);
      if (upper > lower) cells.push({ shape, upper });
    }
    count += children.length;
  }
  const upper = cells.reduce((maximum, c) => Math.max(maximum, c.upper), lower);
  return {
    component: component.id,
    clearance,
    lower,
    upper,
    resolved: upper - lower <= tolerance,
    witness,
  };
}

/**
 * A tighter max(sum) enclosure when each layer's nearest strand is fixed on this cell.
 * For the compact quartic the gradient is globally Lipschitz with H = 8 I0 / w²:
 * the radial eigenvalue is 8 I0/w² (1-s)²(7s-1), s=d²/w², whose absolute value ≤1.
 * Sum gradients before bounding their linear term, preserving cancellation between layers.
 * If all projections lie inside a segment, its field is constant along that strand's axis.
 */
function smoothPrismUpper(
  layers: readonly LatticeLayer[],
  prism: HullPrism,
  sphere: ShapeSphere,
): { upper: number; weights: readonly number[] } | null {
  const vertices = prism.outline.flatMap((p) => [
    { ...p, z: prism.zMin },
    { ...p, z: prism.zMax },
  ]);
  const gradient = { x: 0, y: 0, z: 0 },
    weights = [0, 0, 0];
  let value = 0,
    remainder = 0;
  for (const layer of layers) {
    if (layerDistanceBound(layer, sphere) >= layer.radius) continue;
    let nearest = Infinity,
      second = Infinity,
      strand: LatticeStrand | undefined;
    for (const candidate of layer.strands) {
      const d = pointSegmentDistance(sphere.center, candidate.a, candidate.b);
      if (d < nearest) {
        second = nearest;
        nearest = d;
        strand = candidate;
      } else second = Math.min(second, d);
    }
    if (!strand) continue;
    if (second - nearest <= 2 * sphere.radius) return null;
    const delta = sub(strand.b, strand.a),
      squared = dot(delta, delta);
    const t = squared > 0 ? dot(sub(sphere.center, strand.a), delta) / squared : 0;
    const residual = sub(sphere.center, lerp(strand.a, strand.b, clamp(t)));
    const q = Math.max(0, 1 - nearest ** 2 / layer.radius ** 2);
    const factor = ((-8 * layer.peakIntensity) / layer.radius ** 2) * q ** 3;
    gradient.x += factor * residual.x;
    gradient.y += factor * residual.y;
    gradient.z += factor * residual.z;
    value += layer.peakIntensity * q ** 4;
    const interior =
      squared > 0 &&
      vertices.every((vertex) => {
        const projection = dot(sub(vertex, strand.a), delta) / squared;
        return projection >= 0 && projection <= 1;
      });
    let radiusSquared = 0;
    for (const vertex of vertices) {
      const displacement = sub(vertex, sphere.center);
      const projected = interior
        ? sub(displacement, scale(delta, dot(displacement, delta) / squared))
        : displacement;
      radiusSquared = Math.max(radiusSquared, dot(projected, projected));
    }
    remainder += ((4 * layer.peakIntensity) / layer.radius ** 2) * radiusSquared;
    for (const [i, key] of (['x', 'y', 'z'] as const).entries())
      weights[i] = Math.max(
        weights[i]!,
        interior ? Math.sqrt(Math.max(0, 1 - delta[key] ** 2 / squared)) : 1,
      );
  }
  let linear = -Infinity;
  for (const vertex of vertices)
    linear = Math.max(linear, dot(gradient, sub(vertex, sphere.center)));
  return { upper: value + linear + remainder, weights };
}

/** Clip a convex prism into two true subvolumes; no empty bounding-box corners enter the maximum. */
function splitShape(
  shape: LatticeShape,
  weights: readonly number[] = [1, 1, 1],
): LatticeShape[] | null {
  if (shape.kind !== 'prism') return null;
  const p = shape.prism;
  const xs = p.outline.map((v) => v.x),
    ys = p.outline.map((v) => v.y);
  const ranges = [
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys),
    p.zMax - p.zMin,
  ];
  const scores = ranges.map((range, i) => range * weights[i]!);
  const axis = scores.indexOf(Math.max(...scores));
  if (ranges[axis]! <= 1e-10) return null;
  if (axis === 2) {
    const mid = (p.zMin + p.zMax) / 2;
    return [
      { kind: 'prism', prism: { ...p, zMax: mid } },
      { kind: 'prism', prism: { ...p, zMin: mid } },
    ];
  }
  const key = axis === 0 ? 'x' : 'y';
  const coordinates = axis === 0 ? xs : ys;
  const mid = (Math.min(...coordinates) + Math.max(...coordinates)) / 2;
  return [-1, 1]
    .map((sign) => {
      const outline: { x: number; y: number }[] = [];
      for (let i = 0; i < p.outline.length; i++) {
        const a = p.outline[i]!,
          b = p.outline[(i + 1) % p.outline.length]!;
        const da = sign * (a[key] - mid),
          db = sign * (b[key] - mid);
        if (da >= 0) outline.push(a);
        if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
          const t = da / (da - db);
          outline.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
        }
      }
      return { kind: 'prism' as const, prism: { ...p, outline } };
    })
    .filter((s) => s.prism.outline.length >= 3);
}

export interface ExposureSlice {
  readonly start: number;
  readonly end: number;
  readonly dose: number;
  /** Conservative enclosure from the field's Lipschitz bound and actual motion bound. */
  readonly doseLower: number;
  readonly doseUpper: number;
  readonly intensityLower: number;
  readonly intensityUpper: number;
}
export interface ThresholdInterval {
  readonly threshold: number;
  readonly start: number;
  readonly end: number;
  /** 'above' is certified contiguous dwell; 'unresolved' cannot count as clear or safe. */
  readonly status: 'above' | 'unresolved';
}
export interface ComponentExposure {
  readonly component: string;
  readonly dose: number;
  readonly doseLower: number;
  readonly doseUpper: number;
  /** Maximum absolute error implied by the rigorous enclosure, distinct from Simpson's estimate. */
  readonly doseErrorBound: number;
  /** True only when the rigorous dose enclosure certifies the requested absolute dose tolerance. */
  readonly doseCertified: boolean;
  readonly clearanceLower: number;
  readonly clearanceUpper: number;
  readonly slices: readonly ExposureSlice[];
  readonly thresholds: readonly ThresholdInterval[];
  /** All spatial queries and quadrature refinement checks converged; inspect doseCertified separately. */
  readonly resolved: boolean;
}
export interface ExposureSweep {
  readonly start: number;
  readonly end: number;
  /** Includes COM velocity, rotation × reach, COM shift and deployment. A chord speed is insufficient. */
  readonly maxPointSpeed: number;
  readonly poseAt: (t: number) => LatticePose;
}
export interface ExposureOptions extends SpatialOptions {
  readonly doseTolerance?: number;
  readonly clearanceTolerance?: number;
  readonly timeTolerance?: number;
  readonly thresholds?: readonly number[];
  readonly maxDepth?: number;
}
/**
 * Deterministic dyadic sweep. Motion enclosures prevent tunnelling even with clear endpoints;
 * adaptive Simpson gives the dose estimate, while returned enclosures remain conservative.
 * Consumers must localize damage thresholds against slices, never smear the tick's mean.
 */
export function sweepLatticeExposure(
  field: LatticeField,
  sweep: ExposureSweep,
  options: ExposureOptions = {},
): readonly ComponentExposure[] {
  positive(sweep.end - sweep.start, 'sweep duration');
  if (!Number.isFinite(sweep.maxPointSpeed) || sweep.maxPointSpeed < 0)
    throw new Error('invalid material-point speed bound');
  const duration = sweep.end - sweep.start;
  const doseTolerance = options.doseTolerance ?? 1e-6;
  const clearanceTolerance = options.clearanceTolerance ?? 0.01;
  const timeTolerance = options.timeTolerance ?? 0.00025;
  const maxDepth = options.maxDepth ?? 22;
  const thresholds = options.thresholds ?? [10];
  positive(doseTolerance, 'dose tolerance');
  positive(clearanceTolerance, 'clearance tolerance');
  positive(timeTolerance, 'threshold time tolerance');
  if (!Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > 30)
    throw new Error('sweep depth must be an integer in [0, 30]');
  if (thresholds.some((t) => !Number.isFinite(t) || t < 0))
    throw new Error('intensity thresholds must be finite and nonnegative');
  const radius = Math.min(...field.layers.map((l) => l.radius));
  const lipschitz = field.layers.reduce(
    (sum, l) => sum + ((8 * l.peakIntensity) / (l.radius * Math.sqrt(7))) * (6 / 7) ** 3,
    0,
  );
  const ids = sweep
    .poseAt(sweep.start)
    .components.map((c) => c.id)
    .sort();
  if (new Set(ids).size !== ids.length) throw new Error('component IDs must be unique');
  const poseCache = new Map<number, LatticePose>();
  const poseAt = (t: number) => {
    let pose = poseCache.get(t);
    if (!pose) {
      pose = sweep.poseAt(t);
      poseCache.set(t, pose);
    }
    return pose;
  };
  return ids.map((component) => {
    const cache = new Map<number, ComponentIntensity>();
    const sample = (t: number): ComponentIntensity => {
      const old = cache.get(t);
      if (old) return old;
      const pose = poseAt(t),
        geometry = pose.components.find((c) => c.id === component);
      if (!geometry) throw new Error(`component ${component} vanished during exposure sweep`);
      const value = sampleLatticeComponent(field, pose, geometry, options);
      cache.set(t, value);
      return value;
    };
    const slices: ExposureSlice[] = [],
      intervals: ThresholdInterval[] = [];
    let clearanceLower = Infinity,
      clearanceUpper = Infinity,
      resolved = true;
    const visit = (a: number, b: number, depth: number): void => {
      const h = b - a,
        m = (a + b) / 2,
        center = sample(m),
        travel = (sweep.maxPointSpeed * h) / 2;
      const cLower = center.clearance - travel;
      const low = Math.max(0, center.lower - lipschitz * travel),
        high = center.upper + lipschitz * travel;
      if (cLower > 0) {
        clearanceLower = Math.min(clearanceLower, cLower);
        clearanceUpper = Math.min(clearanceUpper, center.clearance);
        slices.push({
          start: a,
          end: b,
          dose: 0,
          doseLower: 0,
          doseUpper: 0,
          intensityLower: 0,
          intensityUpper: 0,
        });
        return;
      }
      const left = sample(a),
        right = sample(b),
        q1 = sample((a + m) / 2),
        q3 = sample((m + b) / 2);
      const coarse = (h * (left.lower + 4 * center.lower + right.lower)) / 6;
      const fine =
        (h * (left.lower + 4 * q1.lower + 2 * center.lower + 4 * q3.lower + right.lower)) / 12;
      const uncertainThreshold = thresholds.some((t) => low <= t && high >= t);
      const needsSplit =
        travel > clearanceTolerance ||
        travel > radius / 16 ||
        Math.abs(fine - coarse) / 15 > (doseTolerance * h) / duration ||
        (uncertainThreshold && h > timeTolerance);
      if (needsSplit && depth < maxDepth) {
        visit(a, m, depth + 1);
        visit(m, b, depth + 1);
        return;
      }
      if (
        needsSplit ||
        !center.resolved ||
        !left.resolved ||
        !right.resolved ||
        !q1.resolved ||
        !q3.resolved
      )
        resolved = false;
      clearanceLower = Math.min(clearanceLower, cLower);
      clearanceUpper = Math.min(clearanceUpper, left.clearance, center.clearance, right.clearance);
      const dose = Math.max(0, fine + (fine - coarse) / 15);
      slices.push({
        start: a,
        end: b,
        dose,
        doseLower: low * h,
        doseUpper: high * h,
        intensityLower: low,
        intensityUpper: high,
      });
      for (const threshold of thresholds)
        if (high >= threshold)
          intervals.push({
            threshold,
            start: a,
            end: b,
            status: low > threshold ? 'above' : 'unresolved',
          });
    };
    visit(sweep.start, sweep.end, 0);
    const merged: ThresholdInterval[] = [];
    for (const threshold of thresholds)
      for (const interval of intervals.filter((i) => i.threshold === threshold)) {
        const prior = merged.at(-1);
        if (
          prior?.threshold === interval.threshold &&
          prior.status === interval.status &&
          prior.end === interval.start
        )
          merged[merged.length - 1] = { ...prior, end: interval.end };
        else merged.push(interval);
      }
    const dose = slices.reduce((sum, s) => sum + s.dose, 0);
    const doseLower = slices.reduce((sum, s) => sum + s.doseLower, 0);
    const doseUpper = slices.reduce((sum, s) => sum + s.doseUpper, 0);
    const doseErrorBound = Math.max(dose - doseLower, doseUpper - dose);
    return {
      component,
      dose,
      doseLower,
      doseUpper,
      doseErrorBound,
      doseCertified: doseErrorBound <= doseTolerance,
      clearanceLower,
      clearanceUpper,
      slices,
      thresholds: merged.sort((a, b) => a.start - b.start || a.threshold - b.threshold),
      resolved,
    };
  });
}
