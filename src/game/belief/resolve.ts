/**
 * BELIEF side (no truth imports). Turns belief-relative attitude references into inertial
 * attitudes from the believed navigation solution, before a command reaches the ship. Ship
 * systems (2B) reject unresolved references instead of evaluating them against truth.
 *
 * Conventions, the same ones the model's forecast uses for planned burns (src/model README), so
 * the ship flies what was forecast:
 * - prograde / retrograde: along the believed ship velocity in the briefing's inertial frame
 *   (where the primary starts at rest). Near the primary this is orbital prograde to within a
 *   degree for the first day; it is not prograde about a body that moves fast in that frame.
 *   [ASSUMED by 2C; a body-relative rule would have to change in both places together];
 * - toward / away: along the line from the believed ship position to the believed position of
 *   the named body or asteroid;
 * - direction: along the given inertial direction;
 * - roll is held (A11): each of these becomes the attitude that puts the body axis (+x) on the
 *   direction by the smallest rotation from the believed attitude at that moment
 *   (`quat.pointAlong`). In planar flight that is a yaw of atan2(y, x), as before.
 */

import type { AttitudeTarget, Command } from '../../contracts/commands.ts';
import type { BelievedWorld } from '../../contracts/belief.ts';
import { pointAlong, type Quat } from '../../lib/quat.ts';
import type { Vec3 } from '../../lib/vec3.ts';

/** The slice of the believed world attitude references need. */
export interface NavigationView {
  readonly ship: {
    readonly position: Vec3;
    readonly velocity: Vec3;
    /** Believed attitude, body to inertial: what "roll held" turns from. */
    readonly attitude: Quat;
  };
  readonly bodies: readonly {
    readonly id: string;
    readonly position: Vec3;
    readonly velocity: Vec3;
  }[];
  readonly asteroids: readonly { readonly id: string; readonly position: Vec3 }[];
}

export const navigationView = (world: BelievedWorld): NavigationView => world;

const isZero = (v: Vec3): boolean => v.x === 0 && v.y === 0 && v.z === 0;

/** Body axis along `direction`, roll held; undefined for a zero direction. */
function along(direction: Vec3, nav: NavigationView): AttitudeTarget | undefined {
  if (isZero(direction)) return undefined;
  return { reference: 'inertial', attitude: pointAlong(nav.ship.attitude, direction) };
}

/**
 * The inertial (or rate, or free) target the ship can act on, or undefined when the reference
 * cannot be resolved from what the ship believes (unknown object, no velocity, no direction).
 */
export function resolveAttitude(
  target: AttitudeTarget,
  nav: NavigationView,
): AttitudeTarget | undefined {
  switch (target.reference) {
    case 'inertial':
    case 'rate':
    case 'free':
      return target;
    case 'direction':
      return along(target.direction, nav);
    case 'prograde':
    case 'retrograde': {
      const v = nav.ship.velocity;
      return along(target.reference === 'retrograde' ? { x: -v.x, y: -v.y, z: -v.z } : v, nav);
    }
    case 'toward':
    case 'away': {
      const object =
        nav.bodies.find((b) => b.id === target.target) ??
        nav.asteroids.find((a) => a.id === target.target);
      if (!object) return undefined;
      const from = target.reference === 'away' ? object.position : nav.ship.position;
      const to = target.reference === 'away' ? nav.ship.position : object.position;
      return along({ x: to.x - from.x, y: to.y - from.y, z: to.z - from.z }, nav);
    }
  }
}

/**
 * The command with every attitude reference resolved. Commands without one are returned as
 * they are. `undefined` means it could not be resolved and must not reach the ship.
 */
export function resolveCommand(command: Command, nav: NavigationView): Command | undefined {
  if (command.kind === 'attitude') {
    const target = resolveAttitude(command.target, nav);
    return target ? (target === command.target ? command : { ...command, target }) : undefined;
  }
  if (command.kind === 'burn' && command.attitude) {
    const attitude = resolveAttitude(command.attitude, nav);
    return attitude
      ? attitude === command.attitude
        ? command
        : { ...command, attitude }
      : undefined;
  }
  return command;
}
