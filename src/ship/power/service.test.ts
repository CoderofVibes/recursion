import { describe, expect, it } from 'vitest';
import type { ShipSystemsState } from '../../contracts/truth/ship.ts';
import { loadShipDefinition } from '../definition.ts';
import { createShipSystemsState } from '../state.ts';
import { environment } from '../test-helpers.ts';
import { stepPower } from './index.ts';
import {
  electricalService,
  energizedEquipment,
  POWER_LOSS_GRACE_SECONDS,
  ENDURANCE_CAUTION_SECONDS,
} from './service.ts';
import { integrateConditionedInterval } from '../condition/integrate.ts';
import { stepThermal } from '../thermal/index.ts';

const definition = loadShipDefinition();
const fresh = () => createShipSystemsState(definition);
function edit(
  state: ShipSystemsState,
  id: string,
  change: Partial<ShipSystemsState['equipment'][string]>,
) {
  return {
    ...state,
    equipment: { ...state.equipment, [id]: { ...state.equipment[id]!, ...change } },
  };
}
function dispatch(state: ShipSystemsState, irradiance = 0) {
  return stepPower(
    state,
    definition,
    environment(state, undefined, { sunlight: { direction: { x: 1, y: 0, z: 0 }, irradiance } }),
    0.01,
  ).state;
}

describe('physical service for A16/A18 game policy', () => {
  it('publishes the approved values without owning a game loss clock', () => {
    expect(POWER_LOSS_GRACE_SECONDS).toBe(120);
    expect(ENDURANCE_CAUTION_SECONDS).toBe(14400);
    expect(electricalService(dispatch(fresh()), definition).criticalElectricalService).toBe(true);
  });
  it('uses active surviving spare hardware, not an empty-tank predicate or standby fiction', () => {
    let state = fresh();
    state = edit(state, 'eclss-a', { condition: 0 });
    expect(electricalService(dispatch(state), definition).missing).toContain('air');
    state = edit(state, 'eclss-b', { mode: 'active' });
    expect(electricalService(dispatch(state), definition).missing).not.toContain('air');
    state = edit(state, 'eclss-b', { tripped: true });
    expect(electricalService(dispatch(state), definition).missing).toContain('air');
  });
  it('distinguishes a resettable dual trip from irrecoverable dual PDU destruction', () => {
    const tripped = edit(edit(fresh(), 'pdu-a', { tripped: true }), 'pdu-b', { tripped: true });
    expect(electricalService(dispatch(tripped), definition).criticalElectricalService).toBe(false);
    expect(electricalService(dispatch(tripped), definition).irrecoverableDistributionLoss).toBe(
      false,
    );
    const destroyed = edit(edit(tripped, 'pdu-a', { condition: 0 }), 'pdu-b', { condition: 0 });
    expect(electricalService(dispatch(destroyed), definition).irrecoverableDistributionLoss).toBe(
      true,
    );
  });
  it('sustains empty-reactant service only with real illuminated deployed arrays', () => {
    let state = fresh();
    state = {
      ...state,
      configuration: 'allDeployed',
      tanks: { ...state.tanks, 'fuel-cell-hydrogen': 0, 'fuel-cell-oxygen': 0 },
    };
    for (const id of ['solar-left', 'solar-right'])
      state = edit(state, id, { mode: 'deployed', values: { deployment: 1 } });
    for (const id of ['battery-a', 'battery-b']) state = edit(state, id, { values: { charge: 0 } });
    expect(electricalService(dispatch(state, 1361), definition).criticalElectricalService).toBe(
      true,
    );
    expect(electricalService(dispatch(state), definition).criticalElectricalService).toBe(false);
  });
  it('redispatches after a PDU burnout before counting further powered camera exposure', () => {
    let initial = fresh();
    initial = edit(initial, 'pdu-b', { condition: 0 });
    const before = structuredClone(initial);
    const result = integrateConditionedInterval(
      initial,
      definition,
      0.25,
      (state, remaining) => {
        const dispatched = dispatch(state);
        return {
          energized: energizedEquipment(dispatched, definition),
          duration: remaining,
          sample: (dt) => ({
            'pdu-a': { rawDose: 9 * dt, aboveBurnout: true },
            // Camera has 0.05 s less contiguous severe contact than the PDU.
            camera: { rawDose: 11 * dt, aboveBurnout: state.t >= 0.05 },
          }),
        };
      },
      (state, dt) => {
        const power = stepPower(state, definition, environment(state), dt);
        const thermal = stepThermal(power.state, definition, environment(state), dt);
        return { state: thermal.state, events: [...power.events, ...thermal.events] };
      },
    );
    expect(result.state.equipment['pdu-a']!.condition).toBe(0);
    expect(result.state.equipment.camera!.condition).toBe(1);
    expect(result.state.equipment.camera!.powerDraw).toBe(0);
    expect(result.state.exposure.camera).toBeCloseTo(2.75, 10);
    expect(
      result.events.find((e) => e.kind === 'condition-changed' && e.equipment === 'pdu-a')!.t,
    ).toBeCloseTo(0.1, 3);
    expect(electricalService(result.state, definition).irrecoverableDistributionLoss).toBe(true);
    expect(initial).toEqual(before);
  });
});
