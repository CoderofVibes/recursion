import type { ShipDefinition } from '../../contracts/ship.ts';
import type { ShipSystemsState } from '../../contracts/truth/ship.ts';
import { functionAvailable } from '../condition/index.ts';
import { modeOf } from './baseline.ts';

/** A18(5), S21: values for the game owner, not a second game loss timer. */
export const POWER_LOSS_GRACE_SECONDS = 120;
export const ENDURANCE_CAUTION_SECONDS = 4 * 60 * 60;
export const CRITICAL_DELIVERY_FRACTION = 0.95;

const FUNCTIONS = {
  air: ['eclss-a', 'eclss-b'],
  internalCooling: ['internal-pump-a', 'internal-pump-b'],
  externalCooling: ['external-pump-a', 'external-pump-b'],
  flightComputer: ['flight-cpu-a', 'flight-cpu-b'],
  inertialSensing: ['imu-a', 'imu-b'],
} as const;
export type CriticalFunction = keyof typeof FUNCTIONS;

/** Actual delivered service after dispatch, using surviving selected hardware.
 * Standby is not active redundancy, and a trip is not irreversible destruction.
 * Call on a chronological dispatch interval, never on an average across outages.
 * This is truth-side engineering output; only measured equivalents go to UI/model. */
export function electricalService(state: ShipSystemsState, definition: ShipDefinition) {
  const functions = Object.fromEntries(
    Object.entries(FUNCTIONS).map(([name, ids]) => {
      const serving = ids.filter((id) => {
        const e = state.equipment[id];
        if (!functionAvailable(e, state.t) || e?.mode !== 'active') return false;
        const required =
          modeOf(definition, id, 'active').power * (1 + (e.values.radiationLeakage ?? 0));
        return required > 0 && e.powerDraw + 1e-9 >= CRITICAL_DELIVERY_FRACTION * required;
      });
      return [name, { available: serving.length > 0, serving }];
    }),
  ) as Record<CriticalFunction, { available: boolean; serving: string[] }>;
  const missing = (Object.keys(FUNCTIONS) as CriticalFunction[]).filter(
    (key) => !functions[key].available,
  );
  const destroyed = ['pdu-a', 'pdu-b'].filter((id) => (state.equipment[id]?.condition ?? 1) <= 0);
  return {
    criticalElectricalService: missing.length === 0,
    functions,
    missing,
    irrecoverableDistributionLoss: destroyed.length === 2,
    destroyedDistributionUnits: destroyed,
    // Thermal path destruction is separate from insufficient electrical delivery.
    coolingPathIntact:
      (state.equipment['interface-hx']?.condition ?? 0) > 0 &&
      !Object.values(state.equipment).some((e) => e.faults.includes('loop-leak')),
  };
}

/** Energization for condition, derived from a freshly dispatched interval.
 * Idle battery contactors are alive when their healthy feeder supplies real load;
 * a reboot still draws power. This deliberately differs from functionAvailable. */
export function energizedEquipment(
  state: ShipSystemsState,
  definition: ShipDefinition,
): Record<string, boolean> {
  return Object.fromEntries(
    definition.equipment.map((spec) => {
      const e = state.equipment[spec.id];
      let live =
        !!e &&
        e.condition > 0 &&
        !e.tripped &&
        e.mode !== 'off' &&
        (e.powerDraw > 0 || (e.values.generatedPower ?? 0) > 0);
      if (
        e &&
        (spec.kind === 'battery' || spec.kind === 'power-source') &&
        !['off', 'stowed'].includes(e.mode) &&
        e.condition > 0 &&
        !e.tripped
      ) {
        const pdu = state.equipment[spec.bus === 'main-a' ? 'pdu-a' : 'pdu-b'];
        live ||= !!pdu && pdu.condition > 0 && !pdu.tripped && pdu.powerDraw > 0;
      }
      return [spec.id, live];
    }),
  );
}
