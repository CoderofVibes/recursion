/**
 * TRUTH side. Builds the ship's physical arrival state for an encounter and maps the world's
 * hidden calibration into it. Ship systems never read `world.hidden`; the true thrust scale,
 * mount errors and sensor biases reach them only as initial equipment `values`
 * (src/ship README § Integration and state conventions).
 */

import type { ShipDefinition } from '../contracts/ship.ts';
import type {
  EquipmentState,
  HiddenParameters,
  ShipSystemsState,
} from '../contracts/truth/index.ts';
import { createShipSystemsState } from '../ship/index.ts';

/** Hidden parameter suffix (contracts README § Parameter IDs) → the equipment value the ship reads. */
const THRUSTER_VALUES: Readonly<Record<string, string>> = {
  scale: 'thrustScale',
  misalignment: 'misalignment',
  'misalignment-pitch': 'misalignmentPitch',
};
/**
 * For an inertial unit: the accelerometer's bias on each body axis, and the gyro's (its z bias
 * is plain `.bias`, the planar parameter).
 */
const SENSOR_VALUES: Readonly<Record<string, string>> = {
  'bias-x': 'biasX',
  'bias-y': 'biasY',
  'bias-z': 'biasZ',
  bias: 'gyroBias',
  'rate-bias-x': 'gyroBiasX',
  'rate-bias-y': 'gyroBiasY',
};
/** `thruster.rcs.scale` names the group of every RCS pod, not an equipment id. */
const RCS_GROUP = 'rcs';

/**
 * Initial equipment values for the hidden parameters that describe ship hardware.
 *
 * - `thruster.<id>.scale`, `.misalignment` (about body +z), `.misalignment-pitch` (about −y);
 * - `thruster.rcs.scale`: one scale for every RCS jet. The ship keeps a thrust scale per pod
 *   and none for the group, so it is set on every pod; a pod's own `thruster.<pod>.scale`
 *   overrides it;
 * - `sensor.<id>.bias-x`, `.bias-y`, `.bias-z` (accelerometer) and `.bias`, `.rate-bias-x`,
 *   `.rate-bias-y` (gyro: z, then x and y).
 *
 * World physics parameters (`body.*`, `law.*`) are not the ship's and are skipped. An ID that
 * names unknown equipment or an unknown quantity is an authoring error and throws.
 */
export function hiddenEquipmentValues(
  definition: ShipDefinition,
  hidden: HiddenParameters,
): Record<string, Record<string, number>> {
  const values: Record<string, Record<string, number>> = {};
  const set = (equipmentId: string, key: string, value: number): void => {
    (values[equipmentId] ??= {})[key] = value;
  };
  // The group first, so a pod's own value wins whatever order the parameters come in.
  const shared = hidden[`thruster.${RCS_GROUP}.scale`];
  if (shared !== undefined)
    for (const e of definition.equipment)
      if (e.kind === 'rcs-thruster') set(e.id, 'thrustScale', shared);
  for (const [id, value] of Object.entries(hidden)) {
    const [group, equipmentId, quantity] = id.split('.');
    if (group !== 'thruster' && group !== 'sensor') continue;
    if (group === 'thruster' && equipmentId === RCS_GROUP && quantity === 'scale') continue;
    const key =
      group === 'thruster' ? THRUSTER_VALUES[quantity ?? ''] : SENSOR_VALUES[quantity ?? ''];
    if (!equipmentId || !key || !definition.equipment.some((e) => e.id === equipmentId))
      throw new Error(`hidden parameter "${id}" does not name ship hardware the game can set`);
    set(equipmentId, key, value);
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
