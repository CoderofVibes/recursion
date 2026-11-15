import type { EquipmentState } from '../../contracts/truth/ship.ts';

/** 3A's agreed functionAvailable semantics until src/ship/condition is merged.
 * Rebooting hardware still draws power; do not fabricate observations during restart.
 * Replace this local seam with the owner's helper when its module lands. */
export function sensorFunctionAvailable(
  e: EquipmentState | undefined,
  t: number,
): e is EquipmentState {
  return (
    !!e &&
    e.condition > 0 &&
    !e.tripped &&
    e.mode !== 'off' &&
    (e.values.radiationRestartUntil ?? 0) <= t &&
    (e.values.thermalInhibited ?? 0) === 0
  );
}
