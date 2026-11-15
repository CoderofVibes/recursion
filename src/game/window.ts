/**
 * TRUTH side. What the unaided eye sees through the window (DECISIONS A3, A8): the sun, and
 * every body and sunlit rock big enough to make out.
 *
 * This is the one deliberate place where truth reaches the view without passing through an
 * instrument: light needs no sensor. So it carries only what an eye could take in, a direction
 * and an apparent size for each object and whether it is lit, and never a range, a velocity, a
 * mass or a field. A rock the ship has never catalogued can be here; a catalogued one too far
 * or too dark to see is not. Directions are the same in truth's frame and in the briefing's:
 * the two differ by a uniform motion, with parallel axes.
 */

import type { TruthWorld } from '../contracts/truth/index.ts';
import type { WindowObject, WindowView } from '../contracts/view.ts';
import type { Vec3 } from '../lib/vec3.ts';
import { inShadow, occluded } from './environment.ts';

/**
 * The window view from the ship's true position. An asteroid is listed when it is in sunlight,
 * its apparent radius is at least `minAngularRadius` (rad) and no body is in front of it; a
 * body is listed, lit or dark, unless another body hides it.
 */
export function buildWindowView(world: TruthWorld, minAngularRadius: number): WindowView {
  const ship = world.ship.kinematics.position;
  const sun = world.sun;
  const objects: WindowObject[] = [];

  /** Unit direction to a point and half the angle a sphere of `radius` spans from the ship. */
  const sight = (centre: Vec3, radius: number): { direction: Vec3; angularRadius: number } => {
    const dx = centre.x - ship.x;
    const dy = centre.y - ship.y;
    const dz = centre.z - ship.z;
    const range = Math.hypot(dx, dy, dz);
    if (range === 0) return { direction: { x: 1, y: 0, z: 0 }, angularRadius: Math.PI / 2 };
    return {
      direction: { x: dx / range, y: dy / range, z: dz / range },
      angularRadius: range > radius ? Math.asin(radius / range) : Math.PI / 2,
    };
  };

  for (const body of world.bodies) {
    if (occluded(ship, body.position, world.bodies, body.id)) continue;
    objects.push({
      id: body.id,
      kind: 'body',
      ...sight(body.position, body.radius),
      lit: sun !== undefined && !inShadow(body.position, world.bodies, sun, body.id),
    });
  }
  // Without a sun no rock is lit, so none can be seen.
  if (sun)
    for (const rock of world.asteroids) {
      const seen = sight(rock.position, rock.radius);
      if (seen.angularRadius < minAngularRadius) continue;
      if (inShadow(rock.position, world.bodies, sun)) continue;
      if (occluded(ship, rock.position, world.bodies)) continue;
      objects.push({ id: rock.id, kind: 'asteroid', ...seen, lit: true });
    }

  const sunlit = sun !== undefined && !inShadow(ship, world.bodies, sun);
  return {
    // The sun is a point of light infinitely far away: it is in view exactly when the ship is
    // out of every body's shadow.
    ...(sun ? { sun: { direction: sun.direction, visible: sunlit } } : {}),
    sunlit,
    objects,
  };
}
