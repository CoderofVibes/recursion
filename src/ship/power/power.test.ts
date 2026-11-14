import { describe, expect, it } from 'vitest';
import type { ShipSystemsState } from '../../contracts/truth/ship.ts';
import { mockEnvironmentEffects } from '../../contracts/fixtures/truth.ts';
import { loadShipDefinition } from '../definition.ts';
import { createShipSystemsState } from '../state.ts';
import { stepPower } from './index.ts';

const definition = loadShipDefinition();
const env = { ...mockEnvironmentEffects, fieldSignals: {} };
function edit(
  state: ShipSystemsState,
  id: string,
  values: Partial<ShipSystemsState['equipment'][string]>,
): ShipSystemsState {
  return {
    ...state,
    equipment: { ...state.equipment, [id]: { ...state.equipment[id]!, ...values } },
  };
}
function warmSources(state = createShipSystemsState()): ShipSystemsState {
  return edit(edit(state, 'fuel-cell-a', { values: { output: 6000 } }), 'fuel-cell-b', {
    values: { output: 6000 },
  });
}
function ledger(state: ShipSystemsState): Record<string, number> {
  return state.ext!.power as unknown as Record<string, number>;
}

describe('power: baseline C03/C09/C13', () => {
  it('balances bus energy, fuel-cell reactants and retained water', () => {
    const before = warmSources();
    const { state } = stepPower(before, definition, env, 10);
    const p = ledger(state);
    expect(p.generated! + p.discharged!).toBeCloseTo(p.load! + p.charged! + p.conversionLoss!, 9);
    expect(p.generated).toBeCloseTo(3024.2105263157896, 8);
    expect(p.discharged).toBe(0);
    expect(Object.values(state.tanks).reduce((a, b) => a + b, 0)).toBeCloseTo(
      Object.values(before.tanks).reduce((a, b) => a + b, 0),
      10,
    );
    const h = before.tanks['fuel-cell-hydrogen']! - state.tanks['fuel-cell-hydrogen']!;
    expect(before.tanks['fuel-cell-oxygen']! - state.tanks['fuel-cell-oxygen']!).toBeCloseTo(
      8 * h,
      12,
    );
    expect(state.tanks['product-water']).toBeCloseTo(9 * h, 12);
    expect(p.fuelGenerated! * 10).toBeCloseTo(h * 0.5 * 142000000, 5);
  });

  it('integrates startup ramp and bridges it with finite battery energy including losses', () => {
    const before = createShipSystemsState();
    const { state } = stepPower(before, definition, env, 0.1);
    const p = ledger(state);
    expect(p.generated).toBeCloseTo(100, 8);
    expect(p.discharged).toBeGreaterThan(0);
    const lost = ['a', 'b'].reduce(
      (sum, side) =>
        sum +
        before.equipment[`battery-${side}`]!.values.charge! -
        state.equipment[`battery-${side}`]!.values.charge!,
      0,
    );
    expect(lost).toBeCloseTo((p.discharged! * 0.1) / 0.95, 6);
    expect(lost).toBeCloseTo((p.discharged! + p.batteryLoss!) * 0.1, 6);
  });

  it('does not pool unused generation across an open tie', () => {
    const before = edit(warmSources(), 'ion-drive', { mode: 'firing' });
    const open = stepPower(before, definition, env, 1).state;
    expect(open.equipment['battery-b']!.values.output).toBeCloseTo(1430, 8);
    expect(open.equipment['fuel-cell-a']!.values.generatedPower).toBeLessThan(6000);
    const closed = stepPower(
      { ...before, ext: { power: { tieClosed: true } } },
      definition,
      env,
      1,
    ).state;
    expect(closed.equipment['battery-b']!.values.output).toBe(0);
    expect(ledger(closed).generated).toBeCloseTo(
      ledger(open).generated! + ledger(open).discharged!,
      8,
    );
  });

  it('sheds discretionary loads in the declared order and never marks life support shed', () => {
    let before = createShipSystemsState();
    for (const id of ['fuel-cell-a', 'fuel-cell-b']) before = edit(before, id, { mode: 'off' });
    before = edit(before, 'ion-drive', { mode: 'firing' });
    before = edit(before, 'science-processor', { mode: 'lattice' });
    before = edit(before, 'battery-b', { values: { charge: 7200000 + 500 / 0.95 } });
    const { state, events } = stepPower(before, definition, env, 1);
    expect(state.equipment['ion-drive']!.powerDraw).toBe(0);
    expect(state.equipment.camera!.powerDraw).toBe(120);
    expect(state.equipment.comms!.powerDraw).toBe(20);
    expect(state.equipment['science-processor']!.powerDraw).toBeLessThan(1000);
    expect(
      events.filter((e) => e.kind === 'load-shed').some((e) => e.equipment.startsWith('eclss')),
    ).toBe(false);
  });

  it('reports genuine essential shortage without invented power or negative charge', () => {
    let before = createShipSystemsState();
    for (const id of ['fuel-cell-a', 'fuel-cell-b']) before = edit(before, id, { mode: 'off' });
    for (const id of ['battery-a', 'battery-b'])
      before = edit(before, id, { values: { charge: 1 } });
    const { state, events } = stepPower(before, definition, env, 100);
    expect(state.equipment['eclss-a']!.values.requestedPower).toBe(1800);
    expect(state.equipment['eclss-a']!.values.unmetPower).toBeGreaterThan(0);
    expect(state.equipment['eclss-a']!.mode).toBe('active');
    expect(events.some((e) => e.kind === 'equipment-fault' && e.equipment === 'eclss-a')).toBe(
      true,
    );
    expect(state.equipment['battery-a']!.values.charge).toBeGreaterThanOrEqual(0);
    expect(ledger(state).generated! + ledger(state).discharged!).toBeCloseTo(
      ledger(state).load! + ledger(state).conversionLoss!,
      8,
    );
  });

  it('stops stacks at exhausted reactants or full product storage', () => {
    const cases: Record<string, number>[] = [
      { 'fuel-cell-hydrogen': 0 },
      { 'fuel-cell-oxygen': 0 },
      { 'product-water': 54 },
    ];
    for (const tanks of cases) {
      const before = warmSources();
      const result = stepPower(
        { ...before, tanks: { ...before.tanks, ...tanks } },
        definition,
        env,
        1,
      ).state;
      expect(ledger(result).fuelGenerated).toBe(0);
      expect(Object.values(result.tanks).every((x) => x >= 0)).toBe(true);
    }
  });

  it('charges only with actual input and observes charge temperature limits', () => {
    const before = edit(warmSources(), 'battery-a', {
      mode: 'charge',
      values: { charge: 10000000 },
    });
    const state = stepPower(before, definition, env, 10).state;
    expect(state.equipment['battery-a']!.values.charge! - 10000000).toBeCloseTo(
      2000 * 0.95 * 10,
      6,
    );
    expect(state.equipment['battery-a']!.values.output).toBe(0);
    expect(ledger(state).generated! + ledger(state).discharged!).toBeCloseTo(
      ledger(state).load! + ledger(state).charged! + ledger(state).conversionLoss!,
      8,
    );
    const cold = stepPower(
      { ...before, thermal: { ...before.thermal, service: 270 } },
      definition,
      env,
      10,
    ).state;
    expect(cold.equipment['battery-a']!.values.charge).toBe(10000000);
  });

  it('latches overcurrent protection and preserves condition', () => {
    const before = edit(warmSources(), 'camera', { values: { faultPower: 1000 } });
    const first = stepPower(before, definition, env, 0.01);
    expect(first.state.equipment.camera!.tripped).toBe(false);
    const second = stepPower(first.state, definition, env, 0.01);
    expect(second.state.equipment.camera!.tripped).toBe(true);
    expect(second.state.equipment.camera!.condition).toBe(1);
    expect(second.events.some((e) => e.kind === 'breaker-trip' && e.equipment === 'camera')).toBe(
      true,
    );
    const third = stepPower(second.state, definition, env, 1);
    expect(third.state.equipment.camera!.powerDraw).toBe(0);
  });

  it('books only the live fraction of a fault and isolates a feeder within a long step', () => {
    const before = edit(warmSources(), 'camera', { values: { faultPower: 1000 } });
    const result = stepPower(before, definition, env, 1);
    expect(result.state.equipment.camera!.powerDraw).toBeCloseTo(1120 * 0.02, 8);
    expect(result.state.equipment.camera!.values.trippedAt).toBeCloseTo(0.02, 8);
    const p = ledger(result.state);
    expect(p.generated! + p.discharged!).toBeCloseTo(p.load! + p.charged! + p.conversionLoss!, 8);
    const feeder = stepPower(
      edit(warmSources(), 'pdu-b', { values: { faultPower: 40000 } }),
      definition,
      env,
      1,
    );
    expect(feeder.state.equipment['pdu-b']!.tripped).toBe(true);
    expect(feeder.state.equipment.camera!.powerDraw).toBeLessThanOrEqual(120 * 0.02);
    expect(feeder.state.equipment['fuel-cell-b']!.values.generatedPower).toBeLessThanOrEqual(
      6000 * 0.02,
    );
  });

  it('honors parent and child bus limits with a closed tie', () => {
    const restricted = {
      ...definition,
      buses: definition.buses.map((bus) => (bus.id === 'payload' ? { ...bus, limit: 50 } : bus)),
    };
    const before = edit(warmSources(), 'fuel-cell-b', { mode: 'off' });
    const result = stepPower(
      { ...before, ext: { power: { tieClosed: true } } },
      restricted,
      env,
      1,
    ).state;
    const p = ledger(result);
    expect(p.generated! + p.discharged!).toBeCloseTo(p.load! + p.charged! + p.conversionLoss!, 8);
    expect(
      result.equipment.camera!.powerDraw +
        result.equipment.comms!.powerDraw +
        result.equipment['science-processor']!.powerDraw,
    ).toBeLessThanOrEqual(50);
  });

  it('is deterministic and does not mutate input', () => {
    const before = createShipSystemsState();
    const copy = structuredClone(before);
    expect(stepPower(before, definition, env, 0.1)).toEqual(
      stepPower(before, definition, env, 0.1),
    );
    expect(before).toEqual(copy);
  });
});
