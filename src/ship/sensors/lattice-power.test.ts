import { describe, expect, it } from 'vitest';
import baseline from '../../../data/ship-baseline.json';
import type {
  EquipmentState,
  EnvironmentEffects,
  ShipSystemsState,
} from '../../contracts/truth/ship.ts';
import { fromYaw } from '../../lib/quat.ts';
import { loadShipDefinition } from '../definition.ts';
import { stepPower } from '../power/index.ts';
import { createShipSystemsState } from '../state.ts';
import { stepSensors } from './index.ts';
import { decodeLatticeDiagnostic } from './lattice-diagnostic-observations.ts';
import { latticeDiagnosticSchedule, stepLatticeDiagnostic } from './lattice-diagnostic.ts';
import { decodeLatticeFrame } from './lattice-observations.ts';
import { initializeLatticeSensorStreams, stepLatticeAcquisition } from './lattice.ts';

const definition = loadShipDefinition();
const environment = (t = 100): EnvironmentEffects => ({
  t,
  kinematics: {
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    attitude: fromYaw(0),
    angularVelocity: { x: 0, y: 0, z: 0 },
  },
  specificForce: { x: 0, y: 0, z: 0 },
  targets: [],
  intensity: {},
  sunlight: { direction: { x: 0, y: 1, z: 0 }, irradiance: 100 },
  fieldSignals: {
    'ship-environment': { opticsValid: true, starsVisible: true },
    lattice: {
      kind: 'lattice-scene-v1',
      segments: [{ a: { x: 127, y: -24, z: 0 }, b: { x: 127, y: 24, z: 0 } }],
    },
  },
});

function initial(): ShipSystemsState {
  const state = initializeLatticeSensorStreams(
    createShipSystemsState(definition, 'lattice-leakage'),
    'lattice-leakage',
  );
  return {
    ...state,
    t: 100,
    recorder: { ...state.recorder, sampleRate: 10 },
    equipment: Object.fromEntries(
      Object.entries(state.equipment).map(([id, e]) => [
        id,
        {
          ...e,
          mode: id === 'camera' ? 'detail' : id === 'science-processor' ? 'lattice' : e.mode,
          allocation: id === 'camera' ? 200 : id === 'science-processor' ? 1000 : e.allocation,
          values: {
            ...e.values,
            readyAt: 0,
            ...(id.startsWith('fuel-cell') ? { output: 6000 } : {}),
          },
        },
      ]),
    ),
  };
}

function change(state: ShipSystemsState, id: string, patch: Partial<EquipmentState>) {
  return {
    ...state,
    equipment: { ...state.equipment, [id]: { ...state.equipment[id]!, ...patch } },
  };
}

/** Allocation is useful operating demand; dispatch adds the real radiation leakage load. */
function dispatched(id: string, allocation: number, leakage = 0.25) {
  const state = initial();
  const requested = change(state, id, {
    allocation,
    values: { ...state.equipment[id]!.values, radiationLeakage: leakage },
  });
  const result = stepPower(requested, definition, environment(), 0.1).state;
  expect(result.equipment[id]!.powerDraw).toBeCloseTo(allocation * (1 + leakage), 10);
  expect(result.equipment[id]!.values.heat).toBeCloseTo(allocation * (1 + leakage), 10);
  return result;
}

describe('radiation leakage is electrical heat, never sensor work', () => {
  it.each([
    ['camera', 50],
    ['science-processor', 300],
  ] as const)('does not let %s leakage cross the processed acquisition threshold', (id, watts) => {
    const state = dispatched(id, watts);
    const acquired = stepLatticeAcquisition(state, definition, environment(), 0.1, 16384, 10);
    expect(acquired.measurements).toEqual([]);
    const ordinary = stepSensors(state, definition, environment(), 0.1);
    expect(ordinary.measurements.find((m) => m.channel === `${id}.power`)!.value).toEqual([
      watts * 1.25,
    ]);
    expect(ordinary.measurements.some((m) => decodeLatticeFrame(m))).toBe(false);
    if (id === 'camera')
      expect(ordinary.measurements.some((m) => decodeLatticeDiagnostic(m))).toBe(false);
  });

  it('does not grant idle diagnostic processing at 32 useful watts plus 8 watts of heat', () => {
    const state = dispatched('science-processor', 32);
    expect(latticeDiagnosticSchedule(state, definition, environment()).rate).toBe(0);
    const result = stepSensors(state, definition, environment(), 0.1);
    expect(result.measurements.some((m) => decodeLatticeDiagnostic(m))).toBe(false);
    expect(result.measurements.find((m) => m.channel === 'science-processor.power')!.value).toEqual(
      [40],
    );
  });

  it('does not energize recorder acquisition with 14 useful watts plus leakage', () => {
    const state = dispatched('black-box', 14);
    expect(state.equipment['black-box']!.powerDraw).toBe(17.5);
    const result = stepSensors(state, definition, environment(), 0.1);
    expect(result.measurements).toEqual([]);
    expect(result.state.recorder.bytesUsed).toBe(state.recorder.bytesUsed);
  });

  it('keeps a 96 W camera at 0.8 Hz despite drawing 120 W and records the actual draw', () => {
    const state = dispatched('camera', 96);
    const first = stepLatticeDiagnostic(state, definition, environment(), 1024);
    const tile = decodeLatticeDiagnostic(first.measurements[0]!)!;
    expect(tile.acquisitionRate).toBe(0.8);
    expect(tile.cameraPower).toBe(120);
    expect(latticeDiagnosticSchedule(first.state, definition, environment(101)).due).toBe(false);
    expect(latticeDiagnosticSchedule(first.state, definition, environment(101.25)).due).toBe(true);
    const frame = stepLatticeAcquisition(state, definition, environment(), 0.1, 16384, 10);
    expect(decodeLatticeFrame(frame.measurements[0]!)!.effectiveRate).toBe(0.8);
    const packet = stepSensors(state, definition, environment(), 0.1);
    expect(packet.measurements.find((m) => m.channel === 'camera.power')!.value).toEqual([120]);
  });

  it('cannot improve frame resolution or processing rate by burning additional leakage power', () => {
    const frames = [0, 0.25].map((leakage) => {
      const state = dispatched('science-processor', 600, leakage);
      const result = stepLatticeAcquisition(state, definition, environment(), 0.1, 16384, 10);
      return decodeLatticeFrame(result.measurements[0]!)!;
    });
    expect(frames[0]!.processorPower).toBe(600);
    expect(frames[1]!.processorPower).toBe(750);
    expect(frames[0]!.fragments.length).toBeGreaterThan(0);
    expect(frames[1]!.effectiveRate).toBe(frames[0]!.effectiveRate);
    expect(frames[1]!.coverage.angularResolution).toBe(frames[0]!.coverage.angularResolution);
    expect(frames[1]!.fragments).toEqual(frames[0]!.fragments);
  });

  it('keeps actual 18.75 W recorder draw at the 15 useful watt one-packet-per-second limit', () => {
    const state = dispatched('black-box', 15);
    const first = stepSensors(state, definition, environment(), 0.1);
    expect(first.measurements.find((m) => m.channel === 'black-box.power')!.value).toEqual([18.75]);
    expect(first.state.recorder.bytesUsed).toBe(baseline.recorder.bytesPerSample);
    const middleState = stepPower(
      { ...first.state, t: 100.5 },
      definition,
      environment(100.5),
      0.1,
    ).state;
    const middle = stepSensors(middleState, definition, environment(100.5), 0.1);
    expect(middle.measurements).toEqual([]);
    expect(middle.state.recorder.bytesUsed).toBe(first.state.recorder.bytesUsed);
    const nextState = stepPower(
      { ...middle.state, t: 101 },
      definition,
      environment(101),
      0.1,
    ).state;
    const next = stepSensors(nextState, definition, environment(101), 0.1);
    expect(next.measurements.find((m) => m.channel === 'black-box.power')!.value).toEqual([18.75]);
    expect(next.state.recorder.bytesUsed).toBe(2 * baseline.recorder.bytesPerSample);
  });
});
