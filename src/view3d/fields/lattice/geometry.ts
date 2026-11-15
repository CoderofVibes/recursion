import type { Vec3 } from '../../../contracts/index.ts';
import { containsVolume, coverageState } from './data.ts';
import type { LatticeVisual, LatticeVolume } from './data.ts';

/** The same game-to-scene transform as the flight hologram. */
export const scenePoint = (p: Vec3): readonly [number, number, number] => [p.x, p.z, -p.y];
export const segment = (out: number[], a: Vec3, b: Vec3): void => {
  out.push(...scenePoint(a), ...scenePoint(b));
};

/** Analytic clipping of measured geometry to the flight hologram's spherical volume. */
export function clipSegments(flat: readonly number[], center: Vec3, radius: number): number[] {
  if (!(radius > 0) || !Number.isFinite(radius)) return [];
  const origin = scenePoint(center);
  const out: number[] = [];
  for (let i = 0; i + 5 < flat.length; i += 6) {
    const a = [flat[i]!, flat[i + 1]!, flat[i + 2]!];
    const d = [flat[i + 3]! - a[0]!, flat[i + 4]! - a[1]!, flat[i + 5]! - a[2]!];
    const o = a.map((v, k) => v - origin[k]!);
    const aa = d.reduce((sum, v) => sum + v * v, 0);
    if (aa === 0) continue;
    const bb = 2 * d.reduce((sum, v, k) => sum + v * o[k]!, 0);
    const cc = o.reduce((sum, v) => sum + v * v, 0) - radius * radius;
    const determinant = bb * bb - 4 * aa * cc;
    if (determinant < 0) continue;
    const low = Math.max(0, (-bb - Math.sqrt(determinant)) / (2 * aa));
    const high = Math.min(1, (-bb + Math.sqrt(determinant)) / (2 * aa));
    if (high <= low) continue;
    for (const t of [low, high]) for (let k = 0; k < 3; k++) out.push(a[k]! + t * d[k]!);
  }
  return out;
}

export function boxEdges(box: LatticeVolume): number[] {
  const out: number[] = [];
  const c = box.center;
  const h = box.halfSize;
  for (const axis of ['x', 'y', 'z'] as const) {
    const others = (['x', 'y', 'z'] as const).filter((x) => x !== axis);
    for (const a of [-1, 1])
      for (const b of [-1, 1]) {
        const p = { ...c };
        p[others[0]!] += a * h[others[0]!];
        p[others[1]!] += b * h[others[1]!];
        p[axis] -= h[axis];
        segment(out, p, { ...p, [axis]: c[axis] + h[axis] });
      }
  }
  return out;
}

/**
 * Unknown is an occupied, cross-hatched volume. A cell loses its hatch only when wholly
 * enclosed by fresh, calibrated coverage. A partly seen cell stays unknown; no interpolation.
 */
export function unknownHatch(data: LatticeVisual, now: number): number[] {
  const out: number[] = [];
  const volume = data.requestedVolume;
  // Spatial tessellation, not a sensing resolution: conservative whole-cell containment.
  const subdivisions = 6;
  const halfSize = {
    x: volume.halfSize.x / subdivisions,
    y: volume.halfSize.y / subdivisions,
    z: volume.halfSize.z / subdivisions,
  };
  const clear = data.coverage.filter((p) => coverageState(p, now) === 'clear-supported');
  // Compare the original bounds before subdivision arithmetic introduces round-off at edges.
  if (clear.some((p) => containsVolume(p, volume))) return out;
  for (let x = 0; x < subdivisions; x++)
    for (let y = 0; y < subdivisions; y++)
      for (let z = 0; z < subdivisions; z++) {
        const center = {
          x: volume.center.x - volume.halfSize.x + (2 * x + 1) * halfSize.x,
          y: volume.center.y - volume.halfSize.y + (2 * y + 1) * halfSize.y,
          z: volume.center.z - volume.halfSize.z + (2 * z + 1) * halfSize.z,
        };
        if (clear.some((p) => containsVolume(p, { center, halfSize }))) continue;
        segment(
          out,
          { x: center.x - halfSize.x, y: center.y - halfSize.y, z: center.z },
          { x: center.x + halfSize.x, y: center.y + halfSize.y, z: center.z },
        );
        segment(
          out,
          { x: center.x, y: center.y - halfSize.y, z: center.z - halfSize.z },
          { x: center.x, y: center.y + halfSize.y, z: center.z + halfSize.z },
        );
        segment(
          out,
          { x: center.x - halfSize.x, y: center.y, z: center.z + halfSize.z },
          { x: center.x + halfSize.x, y: center.y, z: center.z - halfSize.z },
        );
      }
  return out;
}

/** Grow only along recorded fragment support, never toward an inferred grid neighbour. */
export function revealedSegments(points: readonly Vec3[], fraction: number): number[] {
  const out: number[] = [];
  const lengths = points
    .slice(1)
    .map((p, i) => Math.hypot(p.x - points[i]!.x, p.y - points[i]!.y, p.z - points[i]!.z));
  let remaining = lengths.reduce((sum, n) => sum + n, 0) * Math.max(0, Math.min(1, fraction));
  for (let i = 0; i < lengths.length && remaining > 0; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const f = lengths[i]! > 0 ? Math.min(1, remaining / lengths[i]!) : 0;
    segment(out, a, {
      x: a.x + (b.x - a.x) * f,
      y: a.y + (b.y - a.y) * f,
      z: a.z + (b.z - a.z) * f,
    });
    remaining -= lengths[i]!;
  }
  return out;
}

/** Three orthogonal confidence rings at every observed vertex. The radius is evidence. */
export function uncertaintyRings(points: readonly Vec3[], radius: number): number[] {
  const out: number[] = [];
  const steps = 16;
  for (const p of points)
    for (const plane of ['xy', 'xz', 'yz']) {
      for (let i = 0; i < steps; i++) {
        const a = (2 * Math.PI * i) / steps;
        const b = (2 * Math.PI * (i + 1)) / steps;
        const at = (angle: number): Vec3 => ({
          x: p.x + (plane.includes('x') ? Math.cos(angle) * radius : 0),
          y:
            p.y +
            (plane === 'xy'
              ? Math.sin(angle) * radius
              : plane === 'yz'
                ? Math.cos(angle) * radius
                : 0),
          z: p.z + (plane.includes('z') ? Math.sin(angle) * radius : 0),
        });
        segment(out, at(a), at(b));
      }
    }
  return out;
}
