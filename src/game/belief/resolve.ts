/**
 * BELIEF side (no truth imports). Turns belief-relative attitude references into inertial
 * angles from the believed navigation solution, before a command reaches the ship. Ship
 * systems (2B) reject unresolved references instead of evaluating them against truth.
 *
 * Conventions [ASSUMED; see the 2F handoff: the forecast must resolve planned burns the same way]:
 * - prograde / retrograde: along the believed ship velocity **relative to the nearest believed
 *   body** (orbital prograde about it), or the plain believed velocity if no body is known;
 * - toward / away: along the line from the believed ship position to the believed position of
 *   the named body or asteroid;
 * - `offset` is added counter-clockwise.
 */

import type { AttitudeTarget, Command } from '../../contracts/commands.ts';
import type { BelievedWorld } from '../../contracts/belief.ts';
import type { Radians } from '../../contracts/units.ts';
import { wrapAngle, type Vec2 } from '../../lib/vec2.ts';

/** The slice of the believed world attitude references need. */
export interface NavigationView {
  readonly ship: { readonly position: Vec2; readonly velocity: Vec2 };
  readonly bodies: readonly {
    readonly id: string;
    readonly position: Vec2;
    readonly velocity: Vec2;
  }[];
  readonly asteroids: readonly { readonly id: string; readonly position: Vec2 }[];
}

export const navigationView = (world: BelievedWorld): NavigationView => world;

/** Inertial angle of the believed orbital velocity, or undefined when the ship is at rest. */
export function progradeAngle(nav: NavigationView): Radians | undefined {
  let reference: Vec2 = { x: 0, y: 0 };
  let nearest = Infinity;
  for (const body of nav.bodies) {
    const d = Math.hypot(
      body.position.x - nav.ship.position.x,
      body.position.y - nav.ship.position.y,
    );
    if (d < nearest) {
      nearest = d;
      reference = body.velocity;
    }
  }
  const vx = nav.ship.velocity.x - reference.x;
  const vy = nav.ship.velocity.y - reference.y;
  return vx === 0 && vy === 0 ? undefined : Math.atan2(vy, vx);
}

/**
 * The inertial (or rate, or free) target the ship can act on, or undefined when the reference
 * cannot be resolved from what the ship believes (unknown object, no velocity).
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
    case 'prograde':
    case 'retrograde': {
      const prograde = progradeAngle(nav);
      if (prograde === undefined) return undefined;
      const flip = target.reference === 'retrograde' ? Math.PI : 0;
      return { reference: 'inertial', angle: wrapAngle(prograde + flip + (target.offset ?? 0)) };
    }
    case 'toward':
    case 'away': {
      const object =
        nav.bodies.find((b) => b.id === target.target) ??
        nav.asteroids.find((a) => a.id === target.target);
      if (!object) return undefined;
      const dx = object.position.x - nav.ship.position.x;
      const dy = object.position.y - nav.ship.position.y;
      if (dx === 0 && dy === 0) return undefined;
      const flip = target.reference === 'away' ? Math.PI : 0;
      return {
        reference: 'inertial',
        angle: wrapAngle(Math.atan2(dy, dx) + flip + (target.offset ?? 0)),
      };
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
