/**
 * TRUTH side. The radiation crescent that banks the belt's outer edge (DECISIONS A18 (2) after
 * S21, owner): a visible crescent of radiation clouds attached to Beta's environment, trailing
 * Beta in the binary's own turning frame, so that a pass wide of the rocks is no safe way round
 * them. S21 `belt.md` § Exact recommended geometry gives the field, used here as it is.
 *
 * [FICTIONAL] The clouds are explicit fiction (P13, A16's units): their glow is not a claim that
 * radiation shines in vacuum, and their intensity is in 3C's lattice units, never Gy or Sv. Peak
 * 0.05 U is below every instantaneous burnout threshold: the harm is cumulative (S21: raw 80 /
 * 150 / 320 U s fails standard / power-switch / hardened parts), and it is the ship's damage
 * model's to apply (3A). The truth step keeps the raw exposure account.
 *
 * In the binary's orbital frame (+x from Alpha to Beta, +z the orbit normal, +y = z × x, so
 * Beta moves toward +y and negative azimuth trails it), with q the point less Beta's centre,
 * r = |q|, rho its distance from the z axis and a its azimuth in degrees in [−180, 180):
 *
 *   radial   = S((r − 1,000 km) / 50 km) · S((2,600 km − r) / 200 km)
 *   crescent = S((a + 90) / 5) · S((−30 − a) / 5)
 *   caps     = S((0.2 − rho / r) / 0.1)
 *   I        = 0.05 · radial · max(crescent, caps)
 *
 * with S(u) = c²(3 − 2c), c = u clamped to [0, 1]. Full from 1,050 to 2,400 km out, from −85° to
 * −35°, through every elevation; two polar caps close the frame's singularity. The clouds turn
 * with the binary, not with the screen or the camera.
 */

import type { BodyId } from '../../contracts/ids.ts';
import type { EnvironmentField, TruthWorld } from '../../contracts/truth/index.ts';
import type { WindowCloudBank } from '../../contracts/view.ts';
import { occluded } from '../../game/environment.ts';
import type { Vec3 } from '../../lib/vec3.ts';
import type { SimState } from '../../sim/index.ts';

export interface CrescentSpec {
  /** The body the clouds are attached to, and the one whose line to it is the frame's +x. */
  readonly body: BodyId;
  readonly primary: BodyId;
  /** Inner edge and its ramp, outer edge and its ramp, m. */
  readonly inner: number;
  readonly innerRamp: number;
  readonly outer: number;
  readonly outerRamp: number;
  /** Azimuth support, degrees in the binary frame, and the ramp at each end. */
  readonly from: number;
  readonly to: number;
  readonly azimuthRamp: number;
  /** Polar caps: support where rho / r is below `cap`, full below `cap − capRamp`. */
  readonly cap: number;
  readonly capRamp: number;
  /** Peak intensity, lattice units (U). */
  readonly peak: number;
}

/** S21's crescent [FICTIONAL; dimensions ASSUMED in S21, approved by the owner]. */
export const CRESCENT: CrescentSpec = {
  body: 'beta',
  primary: 'alpha',
  inner: 1_000_000,
  innerRamp: 50_000,
  outer: 2_600_000,
  outerRamp: 200_000,
  from: -90,
  to: -30,
  azimuthRamp: 5,
  cap: 0.2,
  capRamp: 0.1,
  peak: 0.05,
};

const smooth = (u: number): number => {
  const c = u <= 0 ? 0 : u >= 1 ? 1 : u;
  return c * c * (3 - 2 * c);
};

/** The binary's orbital frame at an instant, centred on the clouds' body. */
export interface BinaryAxes {
  readonly origin: Vec3;
  readonly x: Vec3;
  readonly y: Vec3;
  readonly z: Vec3;
}

/** The frame from the two bodies' true states: +x primary → body, +z along their relative orbit's normal. */
export function binaryAxes(world: TruthWorld, spec: CrescentSpec = CRESCENT): BinaryAxes {
  const body = world.bodies.find((b) => b.id === spec.body);
  const primary = world.bodies.find((b) => b.id === spec.primary);
  if (!body || !primary) throw new Error(`the crescent needs ${spec.primary} and ${spec.body}`);
  const rx = body.position.x - primary.position.x;
  const ry = body.position.y - primary.position.y;
  const rz = body.position.z - primary.position.z;
  const vx = body.velocity.x - primary.velocity.x;
  const vy = body.velocity.y - primary.velocity.y;
  const vz = body.velocity.z - primary.velocity.z;
  const r = Math.hypot(rx, ry, rz);
  const x = { x: rx / r, y: ry / r, z: rz / r };
  let hx = ry * vz - rz * vy;
  let hy = rz * vx - rx * vz;
  let hz = rx * vy - ry * vx;
  const h = Math.hypot(hx, hy, hz);
  if (!(h > 0)) {
    // The bodies not moving about each other: take the inertial +z.
    hx = 0;
    hy = 0;
    hz = 1;
  } else {
    hx /= h;
    hy /= h;
    hz /= h;
  }
  const z = { x: hx, y: hy, z: hz };
  const y = { x: z.y * x.z - z.z * x.y, y: z.z * x.x - z.x * x.z, z: z.x * x.y - z.y * x.x };
  return { origin: body.position, x, y, z };
}

/** The clouds' intensity at an inertial point, U. */
export function crescentIntensity(
  point: Vec3,
  axes: BinaryAxes,
  spec: CrescentSpec = CRESCENT,
): number {
  const qx = point.x - axes.origin.x;
  const qy = point.y - axes.origin.y;
  const qz = point.z - axes.origin.z;
  const r = Math.hypot(qx, qy, qz);
  if (r <= spec.inner || r >= spec.outer) return 0;
  const radial =
    smooth((r - spec.inner) / spec.innerRamp) * smooth((spec.outer - r) / spec.outerRamp);
  const fx = qx * axes.x.x + qy * axes.x.y + qz * axes.x.z;
  const fy = qx * axes.y.x + qy * axes.y.y + qz * axes.y.z;
  let a = (Math.atan2(fy, fx) * 180) / Math.PI;
  if (a >= 180) a -= 360;
  const crescent =
    smooth((a - spec.from) / spec.azimuthRamp) * smooth((spec.to - a) / spec.azimuthRamp);
  const rho = Math.hypot(fx, fy);
  const caps = smooth((spec.cap - rho / r) / spec.capRamp);
  return spec.peak * radial * Math.max(crescent, caps);
}

/** What the ship carries, and the furthest any of it (the monitor included) sits from the COM, m. */
const NEAR = 100;

/**
 * The clouds as the encounter's point source (`EncounterSetup.intensityFields`), in the binary's
 * frame at this state: the game samples it at each equipment item and at the radiation monitor
 * (A24, R37). Far from the clouds' shell (more than 100 m inside or outside it, at the centre of
 * mass) there is none, at the cost of a distance.
 */
export function cloudFields(
  spec: CrescentSpec = CRESCENT,
): (state: SimState) => readonly EnvironmentField[] {
  const none: readonly EnvironmentField[] = [];
  return (state) => {
    const world = state.world;
    const body = world.bodies.find((b) => b.id === spec.body);
    if (!body) return none;
    const p = world.ship.kinematics.position;
    const d = Math.hypot(p.x - body.position.x, p.y - body.position.y, p.z - body.position.z);
    if (d < spec.inner - NEAR || d > spec.outer + NEAR) return none;
    const axes = binaryAxes(world, spec);
    return [
      {
        id: 'beta-crescent',
        kind: 'radiation-crescent',
        intensity: (point) => crescentIntensity(point, axes, spec),
      },
    ];
  };
}

/**
 * The crescent's sample points in its own frame, fixed: radii, azimuths and elevations across
 * its support and a little beyond its edges, and the polar caps. Each point with the volume it
 * stands for (the patch's size).
 */
interface LocalPatch {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly size: number;
}

function localPatches(spec: CrescentSpec): readonly LocalPatch[] {
  const out: LocalPatch[] = [];
  const DEG = Math.PI / 180;
  const dr = 150_000;
  for (let r = spec.inner + dr / 2; r < spec.outer; r += dr) {
    for (let a = spec.from + 2.5; a < spec.to; a += 5)
      for (let e = -75; e <= 75; e += 15) {
        const c = Math.cos(e * DEG);
        out.push({
          x: r * c * Math.cos(a * DEG),
          y: r * c * Math.sin(a * DEG),
          z: r * Math.sin(e * DEG),
          size: dr / 2,
        });
      }
    // The caps, all round.
    for (const e of [-84, 84])
      for (let a = 0; a < 360; a += 30) {
        const c = Math.cos(e * DEG);
        out.push({
          x: r * c * Math.cos(a * DEG),
          y: r * c * Math.sin(a * DEG),
          z: r * Math.sin(e * DEG),
          size: dr / 2,
        });
      }
  }
  return out;
}

const patchCache = new WeakMap<CrescentSpec, readonly LocalPatch[]>();

/**
 * The crescent as the eye sees it from the ship (R38, `WindowView.fields`): glowing patches,
 * each a direction, an apparent radius and a brightness (the field's intensity there against its
 * peak), nearest first, those behind a body left out. [FICTIONAL] The glow is fiction (S21).
 */
export function cloudWindow(world: TruthWorld, spec: CrescentSpec = CRESCENT): WindowCloudBank[] {
  let local = patchCache.get(spec);
  if (!local) {
    local = localPatches(spec);
    patchCache.set(spec, local);
  }
  const axes = binaryAxes(world, spec);
  const ship = world.ship.kinematics.position;
  const seen: { range: number; patch: WindowCloudBank['patches'][number] }[] = [];
  for (const q of local) {
    const p = {
      x: axes.origin.x + q.x * axes.x.x + q.y * axes.y.x + q.z * axes.z.x,
      y: axes.origin.y + q.x * axes.x.y + q.y * axes.y.y + q.z * axes.z.y,
      z: axes.origin.z + q.x * axes.x.z + q.y * axes.y.z + q.z * axes.z.z,
    };
    const brightness = crescentIntensity(p, axes, spec) / spec.peak;
    if (!(brightness > 0)) continue;
    const dx = p.x - ship.x;
    const dy = p.y - ship.y;
    const dz = p.z - ship.z;
    const range = Math.hypot(dx, dy, dz);
    if (!(range > 0) || occluded(ship, p, world.bodies)) continue;
    seen.push({
      range,
      patch: {
        direction: { x: dx / range, y: dy / range, z: dz / range },
        angularRadius: range > q.size ? Math.asin(q.size / range) : Math.PI / 2,
        brightness: Math.min(1, brightness),
      },
    });
  }
  if (seen.length === 0) return [];
  seen.sort((a, b) => a.range - b.range);
  return [{ kind: 'cloud-bank', id: 'beta-crescent', patches: seen.map((s) => s.patch) }];
}
