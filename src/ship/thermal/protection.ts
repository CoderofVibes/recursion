import type { ShipDefinition } from '../../contracts/ship.ts';
import type { EquipmentState, ShipSystemsState } from '../../contracts/truth/ship.ts';
import type { ShipEvent } from '../../contracts/measurements.ts';
import { bounded, systems } from '../power/baseline.ts';
import { radiationProfiles } from '../condition/index.ts';

/** Hardware faults, not commands. Repair/isolation commands belong to the root
 * command owner. A reset never removes these permanent faults. */
export type ThermalFault =
  | 'regulator-open'
  | 'regulator-closed'
  | 'loop-leak'
  | 'branch-isolated'
  | 'louver-jam'
  | 'deployment-jam'
  | 'freeze-rupture';

export function hasFault(e: EquipmentState | undefined, fault: ThermalFault): boolean {
  return e?.faults.includes(fault) ?? false;
}

/** [ASSUMED: baseline thermalProtection] Existing node temperatures stand for
 * assembly/cold-plate temperature. Only electrical assemblies trip; no crew or
 * tank death rule is invented here. A heater can warm cold intact hardware. */
export function thermalOperatingFactor(
  e: EquipmentState,
  minimum: number,
  maximum: number,
  margin: number,
): number {
  const temperature = e.temperature ?? 295;
  if (temperature < minimum && !['heater', 'antifreeze'].includes(e.mode)) return 0;
  return bounded((maximum - temperature) / margin, 0, 1);
}

/** Run at thermal substep boundaries. Histories are written only when used,
 * preserving the healthy speed-pass state and all permanent condition. */
export function stepThermalProtection(
  state: ShipSystemsState,
  definition: ShipDefinition,
  dt: number,
): { state: ShipSystemsState; events: ShipEvent[] } {
  const data = systems(definition);
  const protection = data.thermalProtection;
  const equipment = { ...state.equipment };
  const events: ShipEvent[] = [];
  const at = state.t + dt;
  for (const spec of definition.equipment) {
    const e = equipment[spec.id];
    if (!e || !spec.thermalNode || radiationProfiles(definition).get(spec.id)?.susceptibility === 0)
      continue;
    const temperature = state.thermal[spec.thermalNode] ?? e.temperature ?? 295;
    const max = spec.params.tempMax ?? Infinity;
    const min = spec.params.tempMin ?? 0;
    const values = { ...e.values };
    let tripped = e.tripped;
    let condition = e.condition;
    const faults = [...e.faults];
    let changed = false;
    const addFault = (fault: string) => {
      if (!faults.includes(fault)) {
        faults.push(fault);
        events.push({ kind: 'equipment-fault', t: at, equipment: e.id, fault });
      }
      changed = true;
    };
    if (temperature < min || values.thermalInhibited) {
      values.thermalInhibited =
        temperature < min && !['heater', 'antifreeze'].includes(e.mode) ? 1 : 0;
      changed = true;
    }
    if (temperature >= max && condition > 0 && !tripped) {
      tripped = true;
      values.trippedAt = at;
      addFault('overtemperature');
      events.push({ kind: 'breaker-trip', t: at, equipment: e.id });
    }
    if (temperature > max + protection.damageMargin || values.thermalDamageDwell) {
      values.thermalDamageDwell =
        temperature > max + protection.damageMargin ? (values.thermalDamageDwell ?? 0) + dt : 0;
      changed = true;
      if (values.thermalDamageDwell >= protection.damageDwell && condition > 0) {
        condition = 0;
        addFault('thermal-damage');
      }
    }
    if (
      e.id === 'interface-hx' &&
      (temperature < data.thermalLoops[0]!.freezeTemperature || values.freezeDwell)
    ) {
      values.freezeDwell =
        temperature < data.thermalLoops[0]!.freezeTemperature ? (values.freezeDwell ?? 0) + dt : 0;
      changed = true;
      if (
        values.freezeDwell >= protection.freezeRuptureDwell &&
        !faults.includes('freeze-rupture')
      ) {
        condition = 0;
        addFault('freeze-rupture');
      }
    }
    if (condition !== e.condition)
      events.push({ kind: 'condition-changed', t: at, equipment: e.id, condition });
    if (changed) equipment[e.id] = { ...e, values, faults, condition, tripped };
  }
  return { state: { ...state, equipment }, events };
}
