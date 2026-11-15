import { describe, expect, it } from 'vitest';
import baseline from '../../../data/ship-baseline.json';
import { AttemptRecorder } from '../../blackbox/recorder.ts';
import { createChainLink } from '../../content/chain-link/index.ts';
import type { Measurement } from '../../contracts/measurements.ts';
import type { ShipDefinition } from '../../contracts/ship.ts';
import type {
  EquipmentState,
  EnvironmentEffects,
  ShipSystemsState,
} from '../../contracts/truth/ship.ts';
import { fromYaw } from '../../lib/quat.ts';
import { createRng } from '../../lib/rng.ts';
import { loadShipDefinition } from '../definition.ts';
import { stepPower } from '../power/index.ts';
import { createShipSystemsState } from '../state.ts';
import { sensorStreamNames, stepSensors } from './index.ts';
import {
  decodeRadiationReading,
  encodeRadiationReading,
  radiationCaution,
} from './radiation-observations.ts';
import { RADIATION_MONITOR as spec } from './radiation-spec.ts';
import {
  advanceRadiationMonitor,
  initializeRadiationMonitorStream,
  latestRadiationReading,
  radiationMonitorDue,
  recordRadiationMonitor,
} from './radiation.ts';

const definition = loadShipDefinition();
function environment(t: number, rate: number | undefined = 0.05): EnvironmentEffects {
  return {
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
      ...(rate === undefined
        ? {}
        : { [spec.inputKey]: { kind: 'radiation-monitor-input-v1', t, rate } }),
    },
  };
}

function change(
  state: ShipSystemsState,
  id: string,
  patch: Partial<EquipmentState>,
): ShipSystemsState {
  return {
    ...state,
    equipment: { ...state.equipment, [id]: { ...state.equipment[id]!, ...patch } },
  };
}

function initial(): ShipSystemsState {
  let state = createShipSystemsState(definition, 'radiation-tests');
  for (const id of ['fuel-cell-a', 'fuel-cell-b'])
    state = change(state, id, { values: { ...state.equipment[id]!.values, output: 6000 } });
  state = change(state, 'camera', { values: { ...state.equipment.camera!.values, readyAt: 0 } });
  return stepPower(state, definition, environment(0), 0.1).state;
}

const advance = (state: ShipSystemsState, t: number, rate: number | undefined = 0.05, dt = 0.1) =>
  advanceRadiationMonitor({ ...state, t }, definition, environment(t, rate), dt);
const warm = (state = initial(), rate = 0.05) => advance(advance(state, 0, rate, 0.25), 0.25, rate);
const readings = (measurements: readonly Measurement[]) =>
  measurements.map(decodeRadiationReading).filter((r) => r !== undefined);
const missing = (t: number): EnvironmentEffects => ({ ...environment(t), fieldSignals: {} });

function packet(state: ShipSystemsState, t: number, rate = 0.05, design = definition) {
  return stepSensors({ ...state, t }, design, environment(t, rate), 0.1);
}

function recorded(rate: number, t = 100, saturated = false): Measurement {
  return encodeRadiationReading({
    version: 1,
    source: spec.host,
    t,
    rate,
    sigma: 0.001,
    saturated,
    responseTime: spec.responseTime,
    saturationRate: spec.saturationRate,
    validUntil: t + spec.validity,
  });
}

describe('A24 radiation monitor response and private sensor state', () => {
  it('uses the analytical response to the previous input, never the new snapshot retroactively', () => {
    const start = initial();
    const first = advance(start, 0, 1, 0.25);
    expect(radiationMonitorDue(first, 0)).toBe(false);
    expect(recordRadiationMonitor(first, 0).measurements).toEqual([]);
    const falling = advance(first, 0.25, 0, 0.25);
    expect(radiationMonitorDue(falling, 0.25)).toBe(true);
    const expectedResponse = 1 - Math.exp(-1);
    const expectedNoise = createRng(0);
    expectedNoise.setState(start.rng[spec.stream]!);
    const sigma = 0.02 * expectedResponse;
    const result = recordRadiationMonitor(falling, 0.25);
    const reading = readings(result.measurements)[0]!;
    expect(reading.rate).toBe(expectedNoise.normal(expectedResponse, sigma));
    expect(reading.sigma).toBe(0.02 * reading.rate);
    expect(reading.sigma / 0.02).not.toBe(expectedResponse);
    expect(reading.t).toBe(0.25);
    expect(result.state.rng[spec.stream]).toEqual(expectedNoise.getState());
    const settled = advance(result.state, 0.5, 0);
    const nextResponse = expectedResponse * Math.exp(-1);
    const next = readings(recordRadiationMonitor(settled, 0.5).measurements)[0]!;
    expect(next.rate).toBe(expectedNoise.normal(nextResponse, 0.02 * nextResponse));
  });

  it('saturates without exposing the over-range peak through sigma or metadata', () => {
    const samples = [100, 1000].map(
      (rate) => recordRadiationMonitor(warm(initial(), rate), 0.25).measurements[0]!,
    );
    expect(samples[0]).toEqual(samples[1]);
    expect(readings(samples)[0]).toMatchObject({ rate: 25, saturated: true, sigma: 0.5 });
    expect(samples[0]!.value).toEqual([25, 1, 0.25, 25, 2.25]);
    expect(samples[0]!.sigma).toEqual([0.5, 0, 0, 0, 0]);
  });

  it('distinguishes real sensor condition from its reported uncertainty', () => {
    const start = initial();
    const damaged = change(start, spec.host, {
      condition: 0.5,
      values: { ...start.equipment[spec.host]!.values, reportedCondition: 1 },
    });
    const diagnosed = change(damaged, spec.host, {
      values: { ...damaged.equipment[spec.host]!.values, reportedCondition: 0.5 },
    });
    const a = readings(recordRadiationMonitor(warm(damaged, 1), 0.25).measurements)[0]!;
    const b = readings(recordRadiationMonitor(warm(diagnosed, 1), 0.25).measurements)[0]!;
    const rng = createRng(0);
    rng.setState(start.rng[spec.stream]!);
    const response = 1 - Math.exp(-1);
    expect(a.rate).toBe(rng.normal(response, 0.04 * response));
    expect(b.rate).toBe(a.rate);
    expect(a.sigma).toBe(0.02 * a.rate);
    expect(a.sigma / 0.02).not.toBe(response);
    expect(b.sigma).toBe(2 * a.sigma);
  });

  const unavailableHosts: readonly Partial<EquipmentState>[] = [
    { condition: 0 },
    { tripped: true },
    { mode: 'off' },
    { powerDraw: 119 },
    { values: { radiationRestartUntil: 1 } },
    { values: { thermalInhibited: 1 } },
  ];
  it.each(unavailableHosts)('resets response when its host becomes unavailable: %j', (patch) => {
    const state = warm();
    const unavailable = advance(change(state, spec.host, patch), 0.35);
    expect(unavailable.ext?.radiationMonitor).toBeUndefined();
    expect(recordRadiationMonitor(unavailable, 0.35).measurements).toEqual([]);
    expect(unavailable.rng).toEqual(state.rng);
    const restored = { ...unavailable, equipment: state.equipment };
    const beginning = advance(restored, 1, 0.05, 0.25);
    expect(recordRadiationMonitor(beginning, 1).measurements).toEqual([]);
    expect(
      readings(recordRadiationMonitor(advance(beginning, 1.25), 1.25).measurements),
    ).toHaveLength(1);
  });

  it.each([262, 323])(
    'suppresses host operation outside its thermal range at %i K',
    (temperature) => {
      const state = warm();
      const thermal = { ...state, thermal: { ...state.thermal, cabin: temperature } };
      const result = advance(thermal, 0.35);
      expect(result.ext?.radiationMonitor).toBeUndefined();
      expect(result.rng).toEqual(state.rng);
    },
  );

  it('requires a current explicit point input, never component exposure or an inferred zero', () => {
    const state = warm();
    const malformed = [
      missing(0.35),
      {
        ...environment(0.35),
        fieldSignals: { [spec.inputKey]: { kind: 'radiation-monitor-input-v1', t: 0.25, rate: 1 } },
      },
      {
        ...environment(0.35),
        fieldSignals: {
          [spec.inputKey]: { kind: 'radiation-monitor-input-v1', t: 0.35, rate: -1 },
        },
      },
      { ...missing(0.35), intensity: { [spec.host]: 100, camera: 500 } },
    ];
    for (const env of malformed) {
      const result = advanceRadiationMonitor(state, definition, env, 0.1);
      expect(result.ext?.radiationMonitor).toBeUndefined();
      expect(result.rng).toEqual(state.rng);
      expect(recordRadiationMonitor(result, 0.35).measurements).toEqual([]);
    }
    const ordinary = advance(state, 0.35);
    const unrelated = advanceRadiationMonitor(
      { ...state, exposure: { camera: 1e9 } },
      definition,
      { ...environment(0.35), intensity: { camera: 1e9, [spec.host]: 1e9 } },
      0.1,
    );
    expect(recordRadiationMonitor(unrelated, 0.35).measurements).toEqual(
      recordRadiationMonitor(ordinary, 0.35).measurements,
    );
  });

  it('does not integrate an unsupplied gap or backfill old readings after it', () => {
    const state = warm(initial(), 1000);
    const afterGap = advance(state, 10, 0, 0.25);
    expect(recordRadiationMonitor(afterGap, 10).measurements).toEqual([]);
    expect(afterGap.rng).toEqual(state.rng);
    const settled = advance(afterGap, 10.25, 0);
    const result = recordRadiationMonitor(settled, 10.25);
    expect(result.measurements).toHaveLength(1);
    const reading = readings(result.measurements)[0]!;
    expect(reading.t).toBe(10.25);
    expect(reading.sigma).toBe(0.0005);
    expect(reading.rate).toBeLessThan(0.02);
  });

  it('adds an independent named stream and requires explicit legacy initialization', () => {
    const state = initial();
    expect(sensorStreamNames(definition).filter((name) => name === spec.stream)).toHaveLength(1);
    const rng = { ...state.rng };
    delete rng[spec.stream];
    const legacy = { ...state, rng };
    expect(() => recordRadiationMonitor(warm(legacy), 0.25)).toThrow(
      'Missing radiation monitor RNG',
    );
    const migrated = initializeRadiationMonitorStream(legacy, 'radiation-tests');
    expect(migrated.rng).toEqual(state.rng);
    expect(initializeRadiationMonitorStream(migrated, 'different-seed')).toBe(migrated);
    for (const [name, saved] of Object.entries(rng)) expect(migrated.rng[name]).toEqual(saved);
  });
});

describe('radiation monitor power and real packet retention', () => {
  it('does not confuse real leakage draw with sufficient functional CPU power', () => {
    let state = initial();
    state = { ...state, thermal: { ...state.thermal, cabin: 318.25 } };
    state = change(state, spec.host, {
      temperature: 318.25,
      values: { ...state.equipment[spec.host]!.values, radiationLeakage: 0.25 },
    });
    const powered = stepPower(state, definition, environment(0), 0.1).state;
    expect(powered.equipment[spec.host]!.powerDraw).toBe(142.5);
    expect(powered.equipment[spec.host]!.values.heat).toBe(142.5);
    expect(warm(powered).ext?.radiationMonitor).toBeUndefined();
    const packetResult = packet(powered, 0);
    expect(
      packetResult.measurements.find((m) => m.channel === `${spec.host}.power`)!.value,
    ).toEqual([142.5]);
  });

  it('runs a physically dispatched 20 W standby host at only one reading per second', () => {
    const state = initial();
    const configured = change(state, spec.host, {
      mode: 'standby',
      allocation: 20,
      values: { ...state.equipment[spec.host]!.values, radiationLeakage: 0.25 },
    });
    let current = stepPower(configured, definition, environment(0), 0.05).state;
    expect(current.equipment[spec.host]!.powerDraw).toBe(25);
    const observed: Measurement[] = [];
    for (let tick = 0; tick < 60; tick++) {
      current = advance(current, tick * 0.05, 0.05, 0.05);
      const result = recordRadiationMonitor(current, tick * 0.05);
      current = result.state;
      observed.push(...result.measurements);
    }
    expect(observed.map((m) => m.t)).toEqual([0.25, 1.25, 2.25]);
  });

  it.each(['off', 'full', 'disabled'] as const)(
    'keeps the filter causal with recorder %s, without free records or RNG draws',
    (reason) => {
      // Retain the ordinary channel dictionary before interrupting the recorder.
      let state = packet(initial(), 0).state;
      if (reason === 'off') state = change(state, 'black-box', { powerDraw: 0 });
      if (reason === 'full')
        state = {
          ...state,
          recorder: {
            ...state.recorder,
            bytesUsed: state.recorder.capacity - baseline.recorder.reservedEventCapacity,
          },
        };
      if (reason === 'disabled')
        state = { ...state, recorder: { ...state.recorder, sampleRate: 0 } };
      const before = state;
      for (let tick = 1; tick <= 5; tick++) {
        const result = packet(state, tick * 0.1);
        expect(result.measurements).toEqual([]);
        state = result.state;
      }
      expect(state.rng).toEqual(before.rng);
      expect(state.recorder.bytesUsed).toBe(before.recorder.bytesUsed);
      expect(state.ext?.radiationMonitor).toBeDefined();
      // A full recorder has no in-flight erase/replacement operation: its archive remains full.
      if (reason === 'full') return;
      const restored = {
        ...state,
        equipment: initial().equipment,
        recorder: { ...state.recorder, sampleRate: 10 },
      };
      const result = packet(restored, 0.6);
      expect(readings(result.measurements)).toHaveLength(1);
      expect(readings(result.measurements)[0]!.t).toBe(0.6);
      expect(result.state.recorder.bytesUsed - before.recorder.bytesUsed).toBe(
        baseline.recorder.bytesPerSample,
      );
    },
  );

  it.each([151, 152])(
    'charges an actual %i-byte packet and reserves all 88 monitor bytes',
    (bytesPerSample) => {
      const small: ShipDefinition = {
        ...definition,
        systems: { ...definition.systems, recorder: { ...baseline.recorder, bytesPerSample } },
      };
      const state = warm();
      const scheduled = {
        ...state,
        ext: { ...state.ext, sensors: { nextRecorderAt: 100, nextPhysicalPacketAt: 0.25 } },
      };
      const result = packet(scheduled, 0.25, 0.05, small);
      expect(result.state.recorder.bytesUsed - state.recorder.bytesUsed).toBe(bytesPerSample);
      expect(readings(result.measurements)).toHaveLength(bytesPerSample === 152 ? 1 : 0);
      // R52: the monitor senses on board whether or not a packet takes the reading; one that
      // does not fit stays on board, out of the record.
      expect(latestRadiationReading(result.state)?.t).toBe(0.25);
      const repeated = packet(result.state, 0.25, 0.05, small);
      expect(repeated.measurements).toEqual([]);
      expect(repeated.state.recorder.bytesUsed).toBe(result.state.recorder.bytesUsed);
    },
  );

  it('honors the 1 Hz physical recorder even with low selected science cadence and a 10 Hz monitor', () => {
    let state = initial();
    state = { ...state, recorder: { ...state.recorder, sampleRate: 0.05 } };
    state = stepPower(state, definition, environment(0), 0.1).state;
    expect(state.equipment['black-box']!.powerDraw).toBe(15);
    const observed: Measurement[] = [];
    for (let tick = 0; tick < 40; tick++) {
      const result = packet(state, tick * 0.1);
      observed.push(...result.measurements);
      state = result.state;
    }
    expect(readings(observed).map((r) => r.t)).toEqual([1, 2, 3]);
    expect(state.recorder.bytesUsed).toBe(4 * baseline.recorder.bytesPerSample);
  });

  it('R52: senses every second on board, records at the player’s rate, the spike in full and its end', () => {
    // The Gravity range's cadence: 1 s ticks, one ordinary packet every 20 s (the recorder at its
    // 15 W minimum, so one physical packet a second at most).
    let state = initial();
    state = { ...state, recorder: { ...state.recorder, sampleRate: 0.05 } };
    state = stepPower(state, definition, environment(0), 0.1).state;
    const spike = (t: number) => (t >= 20 && t < 30 ? 0.05 : 0);
    const recordedAt: number[] = [];
    const sensedAt: number[] = [];
    for (let t = 0; t < 60; t++) {
      const result = stepSensors({ ...state, t }, definition, environment(t, spike(t)), 1);
      state = result.state;
      for (const r of readings(result.measurements)) recordedAt.push(r.t);
      const sensed = latestRadiationReading(state);
      if (sensed?.t === t) sensedAt.push(t);
    }
    // On board: every second once settled.
    expect(sensedAt).toEqual(Array.from({ length: 59 }, (_, i) => i + 1));
    // In the record: the player's packets (20 s, 40 s); every reading above the 0.02 U threshold
    // (21 to 30 s: the response lags the input by a tick); the first back below it (31 s).
    expect(recordedAt).toEqual([20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 40]);
  });

  it('preserves navigation draws independently and exactly resumes saved response and recording state', () => {
    let observed = initial();
    let withoutMonitor = initial();
    for (let tick = 0; tick < 10; tick++) {
      observed = packet(observed, tick * 0.1).state;
      withoutMonitor = stepSensors(
        { ...withoutMonitor, t: tick * 0.1 },
        definition,
        missing(tick * 0.1),
        0.1,
      ).state;
    }
    expect(observed.rng[spec.stream]).not.toEqual(withoutMonitor.rng[spec.stream]);
    for (const name of sensorStreamNames(definition).filter((name) => name !== spec.stream))
      expect(observed.rng[name]).toEqual(withoutMonitor.rng[name]);
    let saved = JSON.parse(JSON.stringify(observed)) as ShipSystemsState;
    for (let tick = 10; tick < 20; tick++) {
      const a = packet(observed, tick * 0.1);
      const b = packet(saved, tick * 0.1);
      expect(b).toEqual(a);
      observed = a.state;
      saved = b.state;
    }
  });

  it('records and replays only actual timestamped measurements through AttemptRecorder', () => {
    const setup = createChainLink('monitor-archive');
    const header = {
      id: 'monitor-archive',
      index: 1,
      encounterId: 'chain-link',
      startedAt: '2026-11-15T00:00:00Z',
      start: {
        estimate: setup.definition.briefing.arrivalEstimate,
        configuration: setup.definition.briefing.arrivalConfiguration,
        modelVersion: 0,
        briefing: setup.definition.briefing,
      },
    };
    const archive = new AttemptRecorder(header);
    let state = initial();
    for (let tick = 0; tick < 20; tick++) {
      const result = packet(state, tick * 0.1);
      state = result.state;
      archive.recordMeasurements(result.measurements);
    }
    const snapshot = archive.snapshot();
    expect(readings(snapshot.measurements).length).toBeGreaterThan(0);
    const replay = new AttemptRecorder(header);
    replay.recordMeasurements(JSON.parse(JSON.stringify(snapshot.measurements)));
    expect(replay.snapshot().measurements).toEqual(snapshot.measurements);
    for (const reading of readings(snapshot.measurements)) {
      expect(reading.t).toBeGreaterThanOrEqual(0.3);
      expect(reading.validUntil).toBe(reading.t + 2);
    }
  });
});

describe('recorded radiation codec and caution policy', () => {
  it('round-trips exact metadata and rejects malformed or mismatched records', () => {
    const m = recorded(0.05);
    expect(encodeRadiationReading(decodeRadiationReading(m)!)).toEqual(m);
    const malformed: Measurement[] = [
      { ...m, kind: 'lattice-intensity' },
      { ...m, source: 'camera' },
      { ...m, field: 'truth-field' },
      { ...m, target: 'truth-component' },
      { ...m, value: [0.05] },
      { ...m, sigma: [0.001] },
      { ...m, sigma: [0.001, 1, 0, 0, 0] },
      { ...m, value: [26, 1, 0.25, 25, 102] },
      { ...m, value: [0.05, 1, 0.25, 25, 102] },
      { ...m, value: [0.05, 0, 0.25, 25, 1000] },
      { ...m, sigma: [NaN, 0, 0, 0, 0] },
    ];
    for (const bad of malformed) expect(decodeRadiationReading(bad)).toBeUndefined();
  });

  it('raises above the hazard threshold, retains hysteresis and clears only a fresh low reading', () => {
    expect(radiationCaution(recorded(0.02), 100)).toEqual({ latestReadingAt: 100 });
    const caution = radiationCaution(recorded(0.021), 100);
    expect(caution.caution).toMatchObject({
      id: 'radiation-high',
      level: 'caution',
      reportedAt: 100,
    });
    const falling = radiationCaution(recorded(0.015, 101), 101, caution);
    expect(falling.caution!.reportedAt).toBe(101);
    expect(radiationCaution(recorded(0.01, 102), 102, falling).caution).toBeDefined();
    expect(radiationCaution(recorded(0.009, 102), 102, falling)).toEqual({ latestReadingAt: 102 });
  });

  it('never uses missing, stale, future, out-of-order or saturated evidence as an all-clear', () => {
    const caution = radiationCaution(recorded(0.05), 100);
    expect(radiationCaution({ ...recorded(0, 101), channel: 'unrelated' }, 101, caution)).toBe(
      caution,
    );
    expect(radiationCaution(recorded(0, 101), 104, caution)).toBe(caution);
    expect(radiationCaution(recorded(0, 102), 101, caution)).toBe(caution);
    expect(radiationCaution(recorded(0, 99), 100, caution)).toBe(caution);
    expect(radiationCaution(recorded(25, 101, true), 101, caution).caution).toMatchObject({
      saturated: true,
      level: 'caution',
    });
  });

  it('retains ordering after all-clear so delayed high readings cannot re-raise a caution', () => {
    const high = radiationCaution(recorded(0.05, 100), 100);
    const clear = radiationCaution(recorded(0.009, 101), 101, high);
    expect(clear).toEqual({ latestReadingAt: 101 });
    expect(radiationCaution(recorded(0.05, 100.5), 101.1, clear)).toBe(clear);
    expect(radiationCaution(recorded(0.05, 101), 101.1, clear)).toBe(clear);
    expect(radiationCaution(recorded(0.05, 101.1), NaN, clear)).toBe(clear);
    const raised = radiationCaution(recorded(0.05, 102), 102, clear);
    expect(raised.caution).toMatchObject({ reportedAt: 102, level: 'caution' });
  });
});
