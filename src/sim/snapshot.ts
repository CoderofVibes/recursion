/**
 * Helpers that turn a truth world into the geometry the game layer needs for its
 * EnvironmentEffects and ViewSnapshot. Truth side only (P11): the game layer decides what the
 * ship actually perceives.
 */

import type { MassProperties } from '../contracts/ship.ts';
import type { SensorTarget, ShipKinematics, TruthWorld } from '../contracts/truth/index.ts';
import * as quat from '../lib/quat.ts';
import type { Vec3 } from '../lib/vec3.ts';

/** A body-frame point (structural datum origin) in the inertial frame. */
export function bodyPointToWorld(
  point: Vec3,
  kinematics: ShipKinematics,
  mp: MassProperties,
): Vec3 {
  const r = quat.rotate(kinematics.attitude, {
    x: point.x - mp.centerOfMass.x,
    y: point.y - mp.centerOfMass.y,
    z: point.z - mp.centerOfMass.z,
  });
  return {
    x: kinematics.position.x + r.x,
    y: kinematics.position.y + r.y,
    z: kinematics.position.z + r.z,
  };
}

/**
 * The ship's hull in the inertial frame: for each prism, its corners, the outline at `zMin`
 * (counter-clockwise seen from body +z) followed by the same outline at `zMax`.
 */
export function hullInWorld(kinematics: ShipKinematics, mp: MassProperties): Vec3[][] {
  return mp.hull.map((prism) => [
    ...prism.outline.map((p) =>
      bodyPointToWorld({ x: p.x, y: p.y, z: prism.zMin }, kinematics, mp),
    ),
    ...prism.outline.map((p) =>
      bodyPointToWorld({ x: p.x, y: p.y, z: prism.zMax }, kinematics, mp),
    ),
  ]);
}

/**
 * Every body and asteroid as the sensor hardware could see it, relative to the ship's centre
 * of mass. The game layer filters by range, pointing and field of view.
 */
export function sensorTargets(world: TruthWorld): SensorTarget[] {
  const { position: p, velocity: v } = world.ship.kinematics;
  const targets: SensorTarget[] = [];
  for (const b of world.bodies) {
    targets.push({
      id: b.id,
      kind: 'body',
      relativePosition: { x: b.position.x - p.x, y: b.position.y - p.y, z: b.position.z - p.z },
      relativeVelocity: { x: b.velocity.x - v.x, y: b.velocity.y - v.y, z: b.velocity.z - v.z },
      radius: b.radius,
    });
  }
  for (const a of world.asteroids) {
    targets.push({
      id: a.id,
      kind: 'asteroid',
      relativePosition: { x: a.position.x - p.x, y: a.position.y - p.y, z: a.position.z - p.z },
      relativeVelocity: { x: a.velocity.x - v.x, y: a.velocity.y - v.y, z: a.velocity.z - v.z },
      radius: a.radius,
    });
  }
  return targets;
}
