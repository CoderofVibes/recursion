/**
 * Helpers that turn a truth world into the geometry the game layer needs for its
 * EnvironmentEffects and ViewSnapshot. Truth side only (P11): the game layer decides what the
 * ship actually perceives.
 */

import type { MassProperties } from '../contracts/ship.ts';
import type { SensorTarget, ShipKinematics, TruthWorld } from '../contracts/truth/index.ts';
import type { Vec2 } from '../lib/vec2.ts';

/** A body-frame point (structural datum origin) in the inertial frame. */
export function bodyPointToWorld(
  point: Vec2,
  kinematics: ShipKinematics,
  mp: MassProperties,
): Vec2 {
  const c = Math.cos(kinematics.attitude);
  const s = Math.sin(kinematics.attitude);
  const dx = point.x - mp.centerOfMass.x;
  const dy = point.y - mp.centerOfMass.y;
  return {
    x: kinematics.position.x + c * dx - s * dy,
    y: kinematics.position.y + s * dx + c * dy,
  };
}

/** The ship's footprint polygon in the inertial frame (counter-clockwise). */
export function hullInWorld(kinematics: ShipKinematics, mp: MassProperties): Vec2[] {
  return mp.footprint.map((p) => bodyPointToWorld(p, kinematics, mp));
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
      relativePosition: { x: b.position.x - p.x, y: b.position.y - p.y },
      relativeVelocity: { x: b.velocity.x - v.x, y: b.velocity.y - v.y },
      radius: b.radius,
    });
  }
  for (const a of world.asteroids) {
    targets.push({
      id: a.id,
      kind: 'asteroid',
      relativePosition: { x: a.position.x - p.x, y: a.position.y - p.y },
      relativeVelocity: { x: a.velocity.x - v.x, y: a.velocity.y - v.y },
      radius: a.radius,
    });
  }
  return targets;
}
