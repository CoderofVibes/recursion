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
   * Turn to the burn attitude this long before the burn [ASSUMED 300 s: a 180° turn settles
   * in about 300 s with 2B's controller]. Clipped so it never precedes the plan epoch.
   */
  readonly lead?: number;
  /**
   * Let the attitude go free this long after the burn ends [ASSUMED 5 s]. Holding an attitude
   * costs RCS propellant continuously with 2B's controller, so coasting free is the default.
   * Pass `null` to keep holding.
   */
  readonly release?: number | null;
}

/** Turn, burn, release: the commands for one burn, in time order. */
export function burnSteps(options: BurnOptions): PlanStep[] {
  const thruster = options.thruster ?? 'main-engine';
  const lead = Math.min(options.lead ?? 300, options.at);
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
      command: { kind: 'attitude', target: { reference: 'free' } },
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
