/**
 * TRUTH side. The one power loss watch (DECISIONS A16, A18 (5) after S21; 3A's R26):
 *
 * - **both PDUs destroyed** (A16): the ship's electrical distribution is gone for good; the
 *   attempt ends at once;
 * - **critical electrical service out for 120 continuous seconds** (A18 (5)): one of the
 *   critical functions (air, internal and external cooling, the flight computer, inertial
 *   sensing) has had no unit serving it. A game rule for a sustained loss of essential
 *   service, not a claim that the crew dies in two minutes (S21 `power.md`).
 *
 * Both come from 3A's physical signal, `electricalService` (`src/ship/power/service.ts`): a
 * function is served while one of its units is working (active, not failed, not tripped, not
 * rebooting after a radiation upset, not held off by cold) and drawing at least 95% of what its
 * active mode needs, leakage from radiation damage included. Which unit that is, spare or not,
 * is the ship's business. Empty reactants or a flat battery alone are not a loss: a ship on
 * healthy solar power lives.
 *
 * Judged by the truth step after each tick, beside collision loss. The ship notices the
 * shortfall itself (its `equipment-fault` events, and the alerts in `belief/power.ts`); this
 * module only decides the loss.
 */

import type { ShipDefinition } from '../contracts/ship.ts';
import type { ShipSystemsState } from '../contracts/truth/index.ts';
import { electricalService } from '../ship/power/service.ts';

/**
 * How long critical service has been out, s, and which functions were out on the last tick.
 * Plain data, kept in the truth state, so a save part way through keeps the count (S21).
 */
export interface PowerProgress {
  readonly unserved: number;
  readonly functions: readonly string[];
}

export const initialPowerProgress: PowerProgress = { unserved: 0, functions: [] };

/** The critical functions no working unit serves now (3A's names: `air`, `internalCooling`...). */
export function unservedFunctions(systems: ShipSystemsState, definition: ShipDefinition): string[] {
  return electricalService(systems, definition).missing;
}

/**
 * One tick of the power watch: the new progress, and whether the ship is lost. `onset`: where
 * an outage that begins this tick began, s into it (a fault part way through, or at its end);
 * the first tick counts only from there. Default: the whole tick (a dispatch shortfall).
 */
export function evaluatePower(
  progress: PowerProgress,
  systems: ShipSystemsState,
  definition: ShipDefinition,
  dt: number,
  lossGrace: number,
  onset = 0,
): { progress: PowerProgress; lost: boolean; why?: 'distribution' | 'service' } {
  const service = electricalService(systems, definition);
  const functions = service.missing;
  const share = progress.unserved === 0 ? Math.max(0, dt - onset) : dt;
  const next =
    functions.length === 0
      ? progress.unserved === 0 && progress.functions.length === 0
        ? progress
        : initialPowerProgress
      : { unserved: progress.unserved + share, functions };
  if (service.irrecoverableDistributionLoss)
    return { progress: next, lost: true, why: 'distribution' };
  if (next.unserved >= lossGrace) return { progress: next, lost: true, why: 'service' };
  return { progress: next, lost: false };
}
