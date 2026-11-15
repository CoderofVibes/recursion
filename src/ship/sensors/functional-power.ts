import type { EquipmentState } from '../../contracts/truth/ship.ts';

/** 3A dispatch includes radiation leakage in electrical draw and dissipates it as heat.
 * Only the underlying delivered function power can buy sensing or recorder throughput.
 * Keep powerDraw unchanged for measured electrical telemetry and thermal accounting. */
export function functionalPower(e: EquipmentState): number {
  return e.powerDraw / (1 + Math.max(0, e.values.radiationLeakage ?? 0));
}
