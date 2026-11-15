/**
 * TRUTH side. Builds the `EnvironmentEffects` the ship-systems step receives each tick from the
 * simulation state: the sensor scene, sunlight after body shadows (DECISIONS A3) and what the
 * camera could physically see, all in three dimensions (A11). See src/contracts/README.md
 * § One simulation tick.
 */

import type {
  EnvironmentEffects,
  MassiveBody,
  SensorTarget,
  Sun,
  TruthWorld,
} from '../contracts/truth/index.ts';
import type { JsonValue } from '../contracts/units.ts';
import type { Vec3 } from '../lib/vec3.ts';
import type { SimState } from '../sim/index.ts';
import { sensorTargets } from '../sim/index.ts';

export interface EnvironmentOptions {
  /**
   * Objects whose size the ship knows (the briefing gives a radius): the camera can range them.
   * Passed to the ship as it is, every tick, so keep one array and do not change it.
   */
  readonly knownSizeTargets: readonly string[];
  /** A target closer than this to the sun's direction is lost in glare, rad. */
  readonly sunExclusionAngle: number;
}

/**
 * True when `point` lies in the shadow of any body. The sun's rays are parallel, so each body
 * casts a cylinder of its own radius directly away from the sun (`sun.direction` is a unit
 * vector toward it). `skip` leaves one body out (a body does not shadow its own centre).
 */
export function inShadow(
  point: Vec3,
  bodies: readonly MassiveBody[],
  sun: Sun,
  skip?: string,
): boolean {
  const s = sun.direction;
  for (const b of bodies) {
    if (b.id === skip) continue;
    const dx = point.x - b.position.x;
    const dy = point.y - b.position.y;
    const dz = point.z - b.position.z;
    // Behind the body as seen from the sun...
    if (dx * s.x + dy * s.y + dz * s.z >= 0) continue;
    // ...and within its radius of the line through its centre along the rays (|d × s|).
    const cx = dy * s.z - dz * s.y;
    const cy = dz * s.x - dx * s.z;
    const cz = dx * s.y - dy * s.x;
    if (cx * cx + cy * cy + cz * cz < b.radius * b.radius) return true;
  }
  return false;
}

/** Sunlight at a point: the sun's direction, and its irradiance unless a body is in the way. */
export function sunlightAt(world: TruthWorld, point: Vec3): EnvironmentEffects['sunlight'] {
  const sun = world.sun;
  if (!sun) return { direction: { x: 1, y: 0, z: 0 }, irradiance: 0 };
  return {
    direction: sun.direction,
    irradiance: inShadow(point, world.bodies, sun) ? 0 : sun.irradiance,
  };
}

/**
 * True when a body's sphere blocks the straight line from `from` to `to`: the body's centre is
 * nearer that segment than its radius, somewhere strictly between the two ends. `skip` leaves
 * one body out (the one being looked at).
 */
export function occluded(
  from: Vec3,
  to: Vec3,
  bodies: readonly MassiveBody[],
  skip?: string,
): boolean {
  const ex = to.x - from.x;
  const ey = to.y - from.y;
  const ez = to.z - from.z;
  const len2 = ex * ex + ey * ey + ez * ez;
  if (len2 === 0) return false;
  for (const b of bodies) {
    if (b.id === skip) continue;
    const bx = b.position.x - from.x;
    const by = b.position.y - from.y;
    const bz = b.position.z - from.z;
    const along = (bx * ex + by * ey + bz * ez) / len2;
    if (along <= 0 || along >= 1) continue;
    const px = bx - along * ex;
    const py = by - along * ey;
    const pz = bz - along * ez;
    if (px * px + py * py + pz * pz < b.radius * b.radius) return true;
  }
  return false;
}

/**
 * What the camera could see of each target this instant. A target is visible when it is lit
 * (not in a body's shadow), is not the night side of a body the ship is hiding behind, is not
 * within the sun exclusion angle (a cone about the direction to the sun), and has no body's
 * sphere in front of it. With no sun nothing is lit, so nothing is visible.
 */
export function targetVisibility(
  world: TruthWorld,
  targets: readonly SensorTarget[],
  sunExclusionAngle: number,
): Record<string, boolean> {
  const visibility: Record<string, boolean> = {};
  const sun = world.sun;
  const ship = world.ship.kinematics.position;
  const cosExclusion = Math.cos(sunExclusionAngle);
  for (const target of targets) {
    if (!sun) {
      visibility[target.id] = false;
      continue;
    }
    const rx = target.relativePosition.x;
    const ry = target.relativePosition.y;
    const rz = target.relativePosition.z;
    const range = Math.hypot(rx, ry, rz);
    const centre = { x: ship.x + rx, y: ship.y + ry, z: ship.z + rz };
    const body = target.kind === 'body' ? world.bodies.find((b) => b.id === target.id) : undefined;
    const lit = !inShadow(centre, world.bodies, sun, target.id);
    // The ship inside a body's own shadow sees only that body's unlit side.
    const nightSide = body ? inShadow(ship, [body], sun) : false;
    const glare =
      range > 0 &&
      (rx * sun.direction.x + ry * sun.direction.y + rz * sun.direction.z) / range > cosExclusion;
    const blocked = occluded(ship, centre, world.bodies, target.id);
    visibility[target.id] = lit && !nightSide && !glare && !blocked;
  }
  return visibility;
}

/**
 * EnvironmentEffects for the tick that starts at `state.world.t`.
 *
 * - `specificForce` is the previous step's (2A), so accelerometers lag thrust by one tick.
 * - Stars are always visible [ASSUMED: the two star trackers between them always have a clear
 *   patch of sky away from the sun and the bodies].
 * - No lattice or other field products yet (Phase 3).
 */
export function buildEnvironment(state: SimState, options: EnvironmentOptions): EnvironmentEffects {
  const world = state.world;
  const targets = sensorTargets(world);
  const scene: Record<string, JsonValue> = {
    starsVisible: true,
    opticsValid: true,
    visibility: targetVisibility(world, targets, options.sunExclusionAngle),
    knownSizeTargets: options.knownSizeTargets,
  };
  return {
    t: world.t,
    kinematics: world.ship.kinematics,
    specificForce: state.specificForce,
    targets,
    intensity: {},
    fieldSignals: { 'ship-environment': scene },
    sunlight: sunlightAt(world, world.ship.kinematics.position),
  };
}
