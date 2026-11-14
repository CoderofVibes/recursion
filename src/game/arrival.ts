/**
 * TRUTH side. Builds the ship's physical arrival state for an encounter and maps the world's
 * hidden calibration into it. Ship systems (2B) never read `world.hidden`; the true thrust
 * scale, misalignment and sensor biases reach them only as initial equipment `values`.
 */

import type { ShipDefinition } from '../contracts/ship.ts';
import type {
  EquipmentState,
  HiddenParameters,
  ShipSystemsState,
} from '../contracts/truth/index.ts';
import { createShipSystemsState } from '../ship/index.ts';

/** Hidden parameter suffix (README § Parameter IDs) → the equipment value 2B reads. */
const THRUSTER_VALUES: Readonly<Record<string, string>> = {
  scale: 'thrustScale',
  misalignment: 'misalignment',
};
const SENSOR_VALUES: Readonly<Record<string, string>> = {
  'bias-x': 'biasX',
  'bias-y': 'biasY',
  bias: 'gyroBias',
};

/**
 * Initial equipment values for the hidden parameters that describe ship hardware.
 * `thruster.<id>.scale|misalignment` and `sensor.<id>.bias-x|bias-y|bias` are mapped; world
 * physics parameters (`body.*`, `law.*`) are not the ship's and are skipped. An ID that names
 * unknown equipment or an unknown quantity is an authoring error and throws.
 */
export function hiddenEquipmentValues(
  definition: ShipDefinition,
  hidden: HiddenParameters,
): Record<string, Record<string, number>> {
  const values: Record<string, Record<string, number>> = {};
  for (const [id, value] of Object.entries(hidden)) {
    const [group, equipmentId, quantity] = id.split('.');
    if (group !== 'thruster' && group !== 'sensor') continue;
    const key =
      group === 'thruster' ? THRUSTER_VALUES[quantity ?? ''] : SENSOR_VALUES[quantity ?? ''];
    if (!equipmentId || !key || !definition.equipment.some((e) => e.id === equipmentId))
      throw new Error(`hidden parameter "${id}" does not name ship hardware the game can set`);
    (values[equipmentId] ??= {})[key] = value;
  }
  return values;
}

/**
 * A fresh ship-systems state at arrival (t = 0) with the hidden calibration applied.
 * `seed` roots every sensor noise stream, so the same encounter replays exactly (P2).
 */
export function createArrivalSystems(
  definition: ShipDefinition,
  hidden: HiddenParameters,
  seed: string,
): ShipSystemsState {
  const base = createShipSystemsState(definition, seed);
  const overrides = hiddenEquipmentValues(definition, hidden);
  const equipment: Record<string, EquipmentState> = { ...base.equipment };
  for (const [id, extra] of Object.entries(overrides)) {
    const current = equipment[id]!;
    equipment[id] = { ...current, values: { ...current.values, ...extra } };
  }
  return { ...base, equipment };
}
