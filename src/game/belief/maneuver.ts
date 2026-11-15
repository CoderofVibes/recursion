/**
 * BELIEF side (no truth imports). Plan-building helpers: the command sequence for one main
 * engine burn, and burn duration from a wanted speed change using nominal ratings and the
 * believed mass. The console's plan editor and the bench use these; the player can always
 * write the commands directly.
 */

import type { AttitudeTarget, Command, ShipDefinition } from '../../contracts/index.ts';

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
