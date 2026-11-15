import { Vector3 } from 'three';

/** Authored distant directions only: no region positions or run-dependent geometry. */
export const ATLAS_SEED = 'recursion-celestial-atlas-v1';
export const DEG = Math.PI / 180;
const forward = new Vector3(-0.37, 0.025, 1).normalize();
const right = new Vector3().crossVectors(new Vector3(0.2, 1, 0), forward).normalize();
const up = new Vector3().crossVectors(forward, right).normalize();

export function atlasDirection(az: number, el: number): Vector3 {
  return forward
    .clone()
    .multiplyScalar(Math.cos(az * DEG) * Math.cos(el * DEG))
    .addScaledVector(right, Math.sin(az * DEG) * Math.cos(el * DEG))
    .addScaledVector(up, Math.sin(el * DEG))
    .normalize();
}

export interface SkyLandmark {
  readonly id: string;
  readonly kind:
    'galaxy' | 'wheel' | 'needle' | 'hollow' | 'eye' | 'cloud' | 'pair' | 'distant' | 'star';
  readonly direction: Vector3;
  readonly right: Vector3;
  readonly up: Vector3;
  /** Full angular width and height, degrees. */
  readonly width: number;
  readonly height: number;
  readonly major: boolean;
}
function landmark(
  id: string,
  kind: SkyLandmark['kind'],
  az: number,
  el: number,
  width: number,
  height: number,
  roll = 0,
): SkyLandmark {
  const direction = atlasDirection(az, el);
  const r = new Vector3()
    .crossVectors(up, direction)
    .normalize()
    .applyAxisAngle(direction, roll * DEG);
  return {
    id,
    kind,
    direction,
    right: r,
    up: new Vector3().crossVectors(direction, r),
    width,
    height,
    major: kind === 'galaxy' || kind === 'wheel',
  };
}

// One layout for every encounter. These are sky coordinates, not invented course headings.
// C01/route alignment awaits 3D's authored expedition coordinates (not on this branch).
export const SKY_ATLAS: readonly SkyLandmark[] = [
  landmark('galaxy', 'galaxy', 0, 0, 104, 20),
  landmark('ember-wheel', 'wheel', 170, 12, 38, 19, -24),
  landmark('needle', 'needle', 57, 7, 5.5, 0.7, 12),
  landmark('hollow', 'hollow', -122, 8, 4.8, 2.1, -22),
  landmark('eye', 'eye', 24, -25, 3.7, 3.1, 18),
  landmark('blue-cloud', 'cloud', -18, 13, 8, 6),
  landmark('pair', 'pair', 122, -7, 2.1, 1.3, 28),
  landmark('ember', 'star', -60, -5, 0.1, 0.1),
  landmark('far-lens', 'distant', 180, -33, 1.7, 0.4, 30),
  landmark('far-north', 'distant', 90, 58, 1.1, 0.6, -35),
  landmark('far-cloud', 'distant', -90, 58, 1.4, 0.8, 18),
  landmark('far-south', 'distant', -90, -58, 1.5, 0.5, -12),
];
export const DEEP_POLE = atlasDirection(90, -58);
export const atlasLandmark = (id: string): SkyLandmark => {
  const item = SKY_ATLAS.find((l) => l.id === id);
  if (!item) throw new Error(`Unknown sky landmark: ${id}`);
  return item;
};

/** Stable audit directions: the twelve vertices of an icosahedron, 60° full cones. */
export const COVERAGE_DIRECTIONS = (() => {
  const phi = (1 + Math.sqrt(5)) / 2;
  const result: Vector3[] = [];
  for (const a of [-1, 1])
    for (const b of [-1, 1])
      for (const v of [
        new Vector3(0, a, b * phi),
        new Vector3(a, b * phi, 0),
        new Vector3(b * phi, 0, a),
      ]) {
        v.normalize();
        result.push(
          forward.clone().multiplyScalar(v.z).addScaledVector(right, v.x).addScaledVector(up, v.y),
        );
      }
  return result;
})();

/** Use with an actual *inertial scene* course ray when the expedition supplies one. */
export function landmarksInView(direction: Vector3, fullAngle = 150): readonly SkyLandmark[] {
  const d = direction.clone().normalize();
  return SKY_ATLAS.filter((l) => d.angleTo(l.direction) <= ((fullAngle + l.width) * DEG) / 2);
}

/** Inverse of a landmark's angular projection, shared by its sprites and diffuse bake. */
export function landmarkRay(l: SkyLandmark, x: number, y: number): Vector3 {
  return l.direction
    .clone()
    .addScaledVector(l.right, Math.tan(x))
    .addScaledVector(l.up, Math.tan(y))
    .normalize();
}
