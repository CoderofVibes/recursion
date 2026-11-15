/**
 * BELIEF side (no truth imports). Plan-building helpers: the command sequence for one main
 * engine burn, and burn duration from a wanted speed change using nominal ratings and the
 * believed mass. The console's plan editor and the bench use these; the player can always
 * write the commands directly.
 */

import type { AttitudeTarget, Command, ShipDefinition } from '../../contracts/index.ts';
import { axisX, type Quat } from '../../lib/quat.ts';
import type { Vec3 } from '../../lib/vec3.ts';

const G0 = 9.80665;

/** One planned command: seconds after the plan epoch, and the command. */
export interface PlanStep {
  readonly at: number;
  readonly command: Command;
}

export interface BurnOptions {
  /** Start of the burn, seconds after the plan epoch. */
  readonly at: number;
  readonly thruster?: string;
  readonly throttle?: number;
  readonly duration: number;
  readonly attitude: AttitudeTarget;
  /**
   * Turn to the burn attitude this long before the burn. Default `TURN_LEAD`. Clipped so it
   * never precedes the plan epoch: a burn planned sooner than this after commitment may start
   * before the ship has finished turning.
   */
  readonly lead?: number;
  /**
   * This long after the burn ends [ASSUMED 5 s], stop holding the burn attitude and null the
   * turn rate instead: the ship coasts without turning, at whatever attitude it has. Pass
   * `null` to keep holding the burn attitude (a quiet hold costs under 1.2 kg/h).
   *
   * Not `free`: a burn leaves the ship turning (the RCS and the gimbal trimming against the
   * thrust's lever arm; 2×10⁻³ rad/s after a 6 s burn), and a ship left free keeps turning,
   * which smears the camera for hours: in a 5 m/s dive at Alpha it kept 229 fixes on Alpha in
   * 8.4 h instead of about 1,350 (2G handoff). A rate hold costs a few tenths of a kilogram to
   * null the rate and nothing after, since nothing torques a coasting ship.
   */
  readonly release?: number | null;
}

/**
 * [ASSUMED] Time allowed for the turn to a burn attitude, s. The ship turns at no more than
 * 0.008 rad/s so its star trackers keep their solution (`propulsion.attitudeControl.slewRate`
 * in data/ship-baseline.json), and a half turn settles in about 420 s; this leaves a minute.
 */
export const TURN_LEAD = 480;

/**
 * The burn time, after commitment, a plan editor should offer by default (S20, R17): the full
 * turn allowance and two minutes more, so a default burn never fires before a half turn has
 * settled (2G's dive test also used 600 s). The player may still plan a burn sooner; a burn
 * planned sooner than its turn needs shows as not ready (`turnReadiness`), and nothing delays it.
 */
export const DEFAULT_BURN_AT = 600;

/** [ASSUMED] Settling after a slew, s: a half turn slews in 393 s and settles in about 420 (2G). */
export const TURN_SETTLE = 30;

/** The design's slew-rate limit, rad/s (`propulsion.attitudeControl.slewRate`, 0.008). */
export function slewRate(definition: ShipDefinition): number {
  const propulsion = definition.systems?.propulsion as
    { readonly attitudeControl?: { readonly slewRate?: number } } | undefined;
  return propulsion?.attitudeControl?.slewRate ?? 0.008;
}

/** Seconds to turn the nose (body +x) through `angle` rad at the slew limit and settle. */
export function turnTime(definition: ShipDefinition, angle: number): number {
  return angle > 0 ? angle / slewRate(definition) + TURN_SETTLE : 0;
}

export interface TurnReadiness {
  /** The turn from the attitude now to the burn's direction, rad. */
  readonly angle: number;
  /** What the turn needs, s, and what the plan gives it, s. */
  readonly needed: number;
  readonly lead: number;
  /** The ship will have turned and settled by the burn. */
  readonly ready: boolean;
}

/**
 * Whether a planned burn leaves the ship time to turn to it (S20, R17): from the believed
 * attitude now to the direction the burn will thrust along (the nose, body +x), at the design's
 * slew limit. `lead` is the time from now to the burn. The plan editor shows a burn that is not
 * ready; the game never delays a committed command.
 */
export function turnReadiness(
  definition: ShipDefinition,
  attitude: Quat,
  direction: Vec3,
  lead: number,
): TurnReadiness {
  const nose = axisX(attitude);
  const n = Math.hypot(direction.x, direction.y, direction.z);
  const cos = n > 0 ? (nose.x * direction.x + nose.y * direction.y + nose.z * direction.z) / n : 1;
  const angle = Math.acos(Math.min(1, Math.max(-1, cos)));
  const needed = turnTime(definition, angle);
  return { angle, needed, lead, ready: lead >= needed };
}

/** Turn, burn, release: the commands for one burn, in time order. */
export function burnSteps(options: BurnOptions): PlanStep[] {
  const thruster = options.thruster ?? 'main-engine';
  const lead = Math.min(options.lead ?? TURN_LEAD, options.at);
  const steps: PlanStep[] = [];
  if (lead > 0)
    steps.push({ at: options.at - lead, command: { kind: 'attitude', target: options.attitude } });
  steps.push({
    at: options.at,
    command: {
      kind: 'burn',
      thruster,
      throttle: options.throttle ?? 1,
      duration: options.duration,
      attitude: options.attitude,
    },
  });
  if (options.release !== null)
    steps.push({
      at: options.at + options.duration + (options.release ?? 5),
      command: { kind: 'attitude', target: { reference: 'rate', rate: { x: 0, y: 0, z: 0 } } },
    });
  return steps;
}

/**
 * Burn time for a speed change at full rated thrust, from the rocket equation with nominal
 * thrust and specific impulse and the given (believed) mass. The true engine may differ.
 */
export function burnDuration(
  definition: ShipDefinition,
  mass: number,
  deltaV: number,
  thruster = 'main-engine',
  throttle = 1,
): number {
  const spec = definition.equipment.find((e) => e.id === thruster);
  const thrust = (spec?.params.thrust ?? 0) * throttle;
  const exhaust = (spec?.params.isp ?? 0) * G0;
  if (!(thrust > 0) || !(exhaust > 0)) return 0;
  const burned = mass * (1 - Math.exp(-Math.abs(deltaV) / exhaust));
  return burned / (thrust / exhaust);
}
