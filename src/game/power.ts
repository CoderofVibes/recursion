/**
 * TRUTH side. Running out of power is a cause of loss (DECISIONS A18 (5)): when every life-
 * support unit the ship is running has gone without the power it needs for `lossGrace` seconds
 * in a row, the crew is lost. The ship notices the shortfall long before (its load-shed events
 * and the cautions in `belief/power.ts`); this module only decides the loss.
 *
 * Called by the session after each tick. [Move into `truth-step.ts` beside collision loss once
 * 2G's speed pass has merged and that file is 2F's again.]
 */

import type { ShipDefinition } from '../contracts/ship.ts';
import type { ShipSystemsState } from '../contracts/truth/index.ts';

/** How long life support has gone without power, s. Plain data. */
export interface PowerProgress {
  readonly starved: number;
}

export const initialPowerProgress: PowerProgress = { starved: 0 };

/** The power a unit's mode needs, W (the ship's own rating for that mode). */
function modePower(definition: ShipDefinition, id: string, mode: string): number {
  const spec = definition.equipment.find((e) => e.id === id);
  return spec?.params[`mode.${mode}.power`] ?? spec?.ratedPower ?? 0;
}

/**
 * True when life support is unpowered: no life-support unit is both meant to run (its mode
 * draws power) and drawing what that mode needs. A unit switched off or in standby does not
 * count as running; with none running at all, life support is unpowered too.
 */
export function lifeSupportStarved(systems: ShipSystemsState, definition: ShipDefinition): boolean {
  let running = false;
  for (const spec of definition.equipment) {
    if (spec.kind !== 'life-support') continue;
    const e = systems.equipment[spec.id];
    if (!e || e.condition <= 0) continue;
    const need = modePower(definition, spec.id, e.mode);
    if (!(need > 0) || e.mode === 'standby' || e.mode === 'off') continue;
    // Within a watt of what the mode needs counts as powered (rounding in the dispatch).
    if (e.powerDraw >= need - 1) running = true;
  }
  return !running;
}

/** One tick of the power watch: the new progress, and whether the ship is lost. */
export function evaluatePower(
  progress: PowerProgress,
  systems: ShipSystemsState,
  definition: ShipDefinition,
  dt: number,
  lossGrace: number,
): { progress: PowerProgress; lost: boolean } {
  const starved = lifeSupportStarved(systems, definition) ? progress.starved + dt : 0;
  return { progress: { starved }, lost: starved >= lossGrace };
}
