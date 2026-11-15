import { describe, expect, it } from 'vitest';
import type { ShipSystemsState } from '../../contracts/truth/ship.ts';
import { loadShipDefinition } from '../definition.ts';
import { createShipSystemsState } from '../state.ts';
import { environment } from '../test-helpers.ts';
import { stepPower } from '../power/index.ts';
import { stepThermal } from './index.ts';
import { stepThermalProtection } from './protection.ts';
import { applyCommands } from '../commands.ts';

const definition = loadShipDefinition();
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
const fresh = () => createShipSystemsState(definition);
const power = (state: ShipSystemsState) =>
  stepPower(state, definition, environment(state), 1).state;

describe('thermal failure paths and deliberate recovery', () => {
  it.each([0, 0.85, undefined])(
    'records reported thermal condition (%s), preserving permanent failure',
    (reportedCondition) => {
      let state = fresh();
      const camera = state.equipment.camera!;
      const values =
        reportedCondition === undefined ? camera.values : { ...camera.values, reportedCondition };
      state = edit(state, 'camera', { values });
      state = { ...state, thermal: { ...state.thermal, service: 380 } };
      const result = stepThermalProtection(state, definition, 30);
      expect(result.state.equipment.camera!.condition).toBe(0);
      expect(result.state.equipment.camera!.faults).toContain('thermal-damage');
      expect(
        result.events.filter((e) => e.kind === 'condition-changed' && e.equipment === 'camera'),
      ).toEqual([
        {
          kind: 'condition-changed',
          t: 30,
          equipment: 'camera',
          condition: reportedCondition ?? 0,
        },
      ]);
    },
  );

  it('powers the antifreeze heater while cold and applies thermostat hysteresis', () => {
    let state = edit(fresh(), 'interface-hx', {
      mode: 'antifreeze',
      temperature: 277,
      values: { thermalInhibited: 1 },
    });
    state = { ...state, thermal: { ...state.thermal, 'hx-water': 277 } };
    state = power(state);
    expect(state.equipment['interface-hx']!.powerDraw).toBe(220);
    expect(state.equipment['interface-hx']!.values.heat).toBe(220);
    state = power({ ...state, thermal: { ...state.thermal, 'hx-water': 280 } });
    expect(state.equipment['interface-hx']!.powerDraw).toBe(220);
    state = power({ ...state, thermal: { ...state.thermal, 'hx-water': 284 } });
    expect(state.equipment['interface-hx']!.powerDraw).toBe(20);
    state = power({ ...state, thermal: { ...state.thermal, 'hx-water': 280 } });
    expect(state.equipment['interface-hx']!.powerDraw).toBe(20);
  });
  it('retains freeze rupture across heating, reset and a new pump', () => {
    let state = fresh();
    state = { ...state, thermal: { ...state.thermal, 'hx-water': 272 } };
    const almost = stepThermalProtection(state, definition, 59).state;
    expect(almost.equipment['interface-hx']!.condition).toBe(1);
    const resumed = JSON.parse(JSON.stringify(almost)) as ShipSystemsState;
    const ruptured = stepThermalProtection({ ...resumed, t: 59 }, definition, 1);
    expect(ruptured.events).toContainEqual({
      kind: 'equipment-fault',
      t: 60,
      equipment: 'interface-hx',
      fault: 'freeze-rupture',
    });
    const warm = stepThermalProtection(
      { ...ruptured.state, thermal: { ...state.thermal, 'hx-water': 290 } },
      definition,
      10,
    ).state;
    const reset = applyCommands({ ...warm, t: 100 }, definition, [
      { kind: 'mode', equipment: 'interface-hx', mode: 'reset' },
    ]);
    expect(reset.state.equipment['interface-hx']!.condition).toBe(0);
    expect(reset.state.equipment['interface-hx']!.faults).toContain('freeze-rupture');
    expect(reset.events[0]?.kind).toBe('command-rejected');
  });
  it('keeps an overtemperature trip recoverable but residual-heat damage permanent', () => {
    const state = { ...fresh(), thermal: { ...fresh().thermal, service: 380 } };
    const hot = stepThermalProtection(state, definition, 1).state;
    expect(hot.equipment.camera!.tripped).toBe(true);
    expect(hot.equipment.camera!.condition).toBe(1);
    const cooled = stepThermalProtection(
      { ...hot, thermal: { ...hot.thermal, service: 295 } },
      definition,
      1,
    );
    expect(cooled.state.equipment.camera!.tripped).toBe(true);
    expect(cooled.state.equipment.camera!.values.thermalDamageDwell).toBe(0);
    const damaged = stepThermalProtection(hot, definition, 29).state;
    expect(damaged.equipment.camera!.condition).toBe(0);
    expect(damaged.equipment.camera!.faults).toContain('thermal-damage');
    expect(damaged.equipment.crew!.condition).toBe(1);
  });
  it('uses surviving pumps but cannot cure a common-loop leak with the spare', () => {
    let state = power(fresh());
    state = { ...state, thermal: { ...state.thermal, service: 310 } };
    const active = stepThermal(state, definition, environment(state), 10).state;
    let failed = edit(state, 'external-pump-a', { condition: 0 });
    failed = power(edit(failed, 'external-pump-b', { mode: 'active' }));
    const spare = stepThermal(failed, definition, environment(failed), 10).state;
    expect(spare.thermal.service).toBeCloseTo(active.thermal.service!, 2);
    const leaking = edit(failed, 'external-pump-a', { faults: ['loop-leak'] });
    const noFlow = stepThermal(leaking, definition, environment(leaking), 10).state;
    expect(noFlow.thermal.service).toBeGreaterThan(spare.thermal.service!);
  });
  it('models failed-open cold soak, jammed louvers and isolated radiator branches conservatively', () => {
    const state = power(fresh());
    const cold = { ...state, thermal: { ...state.thermal, 'external-loop': 240 } };
    const regulated = stepThermal(cold, definition, environment(cold), 10).state;
    const open = edit(cold, 'interface-hx', { faults: ['regulator-open'] });
    const failed = stepThermal(open, definition, environment(open), 10).state;
    expect(failed.thermal['hx-water']).toBeLessThan(regulated.thermal['hx-water']!);
    const jam = edit(state, 'radiator-left', {
      faults: ['louver-jam'],
      values: { ...state.equipment['radiator-left']!.values, louverEmission: 0.2 },
    });
    const jammed = stepThermal(jam, definition, environment(jam), 20).state;
    expect(jammed.equipment['radiator-left']!.values.louverEmission).toBe(0.2);
    const isolated = edit(jam, 'radiator-right', { faults: ['branch-isolated'] });
    const one = stepThermal(isolated, definition, environment(isolated), 20).state;
    expect(one.thermal['external-loop']).toBeGreaterThan(jammed.thermal['external-loop']!);
    expect(Math.abs((one.ext!.thermal as Record<string, number>).energyResidual!)).toBeLessThan(
      1e-4,
    );
  });
});
