/**
 * TRUTH side. Losing critical electrical service is a cause of loss (DECISIONS A18 (5), after
 * S21): when one of the ship's critical functions has gone without the power it needs for
 * `lossGrace` seconds in a row (120 s), the attempt ends. It is a game rule for a sustained loss
 * of essential service, not a claim that the crew dies in two minutes (S21 `power.md`).
 *
 * The critical functions are the redundancy groups the ship never sheds: the air train, the
 * internal and external cooling pumps, the flight computer and the IMU. A function is served
 * while one of its units is working: in its `active` mode, not failed, not tripped and drawing at
 * least 95% of what that mode needs. Which unit that is, spare or not, is the ship's business
 * (it substitutes a healthy spare before it sheds anything); this module reads what the ship did.
 * Empty reactants or a flat battery alone are not a loss: a ship on healthy solar power lives.
 *
 * Judged by the truth step after each tick, beside collision loss. The ship notices the
 * shortfall itself (its `equipment-fault` and `load-shed` events, and the alerts in
 * `belief/power.ts`); this module only decides the loss.
 */

import type { ShipDefinition } from '../contracts/ship.ts';
import type { ShipSystemsState } from '../contracts/truth/index.ts';

/**
 * The redundancy groups whose loss of power ends the attempt: the ones the design never sheds
 * (S21; for the baseline ship `eclss`, `internal-pump`, `external-pump`, `flight-cpu`, `imu`).
 */
export function criticalGroups(definition: ShipDefinition): string[] {
  const groups: string[] = [];
  for (const e of definition.equipment)
    if (e.sheddable === false && e.redundancyGroup && !groups.includes(e.redundancyGroup))
      groups.push(e.redundancyGroup);
  return groups;
}

/** [ASSUMED: S21] A unit drawing less than this share of its mode's power is not served. */
export const SERVED_FRACTION = 0.95;

/**
 * How long critical service has been out, s, and which functions were out on the last tick.
 * Plain data, kept in the truth state, so a save part way through keeps the count (S21).
 */
export interface PowerProgress {
  readonly unserved: number;
  readonly functions: readonly string[];
}

export const initialPowerProgress: PowerProgress = { unserved: 0, functions: [] };

interface CriticalTable {
  readonly group: string;
  /** Each unit of the group, and the draw that counts as served, W. */
  readonly units: readonly { readonly id: string; readonly served: number }[];
}

/** Worked out once per design: the judge runs every tick. */
const tables = new WeakMap<ShipDefinition, readonly CriticalTable[]>();

function criticalTable(definition: ShipDefinition): readonly CriticalTable[] {
  let table = tables.get(definition);
  if (!table) {
    table = criticalGroups(definition).map((group) => ({
      group,
      units: definition.equipment
        .filter((e) => e.redundancyGroup === group)
        .map((e) => ({
          id: e.id,
          served: SERVED_FRACTION * (e.params['mode.active.power'] ?? e.ratedPower ?? 0),
        })),
    }));
    tables.set(definition, table);
  }
  return table;
}

/** The critical functions no working unit serves now, in the design's order. */
export function unservedFunctions(systems: ShipSystemsState, definition: ShipDefinition): string[] {
  const out: string[] = [];
  for (const { group, units } of criticalTable(definition)) {
    let served = false;
    for (const unit of units) {
      const e = systems.equipment[unit.id];
      if (!e || e.mode !== 'active' || e.condition <= 0 || e.tripped) continue;
      if (e.powerDraw >= unit.served) {
        served = true;
        break;
      }
    }
    if (!served) out.push(group);
  }
  return out;
}

/** One tick of the power watch: the new progress, and whether the ship is lost. */
export function evaluatePower(
  progress: PowerProgress,
  systems: ShipSystemsState,
  definition: ShipDefinition,
  dt: number,
  lossGrace: number,
): { progress: PowerProgress; lost: boolean } {
  const functions = unservedFunctions(systems, definition);
  if (functions.length === 0)
    return { progress: progress.unserved === 0 ? progress : initialPowerProgress, lost: false };
  const unserved = progress.unserved + dt;
  return { progress: { unserved, functions }, lost: unserved >= lossGrace };
}
