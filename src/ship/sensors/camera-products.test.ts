import { describe, expect, it } from 'vitest';
import baseline from '../../../data/ship-baseline.json';
import { AttemptRecorder } from '../../blackbox/recorder.ts';
import { createChainLink } from '../../content/chain-link/index.ts';
import type { Measurement } from '../../contracts/measurements.ts';
import type {
  EquipmentState,
  EnvironmentEffects,
  ShipSystemsState,
} from '../../contracts/truth/ship.ts';
import type { JsonValue } from '../../contracts/units.ts';
import { fromYaw } from '../../lib/quat.ts';
import { loadShipDefinition } from '../definition.ts';
import { stepPower } from '../power/index.ts';
import { createShipSystemsState } from '../state.ts';
import { sensorStreamNames, stepSensors } from './index.ts';
import { decodeLatticeDiagnostic } from './lattice-diagnostic-observations.ts';
import { decodeLatticeFrame } from './lattice-observations.ts';
import {
  initializeLatticeSensorStreams,
  LATTICE_DIAGNOSTIC_STREAM,
  LATTICE_SENSOR_STREAM,
} from './lattice.ts';
import { decodeRadiationReading } from './radiation-observations.ts';
import { RADIATION_MONITOR } from './radiation-spec.ts';
import { WELL_CAMERA_STREAM } from './wells.ts';
import { decodeWellCameraFrame } from './wells-observations.ts';

const definition = loadShipDefinition();
type Product = 'lattice' | 'wells';
interface ProductMemory {
  readonly sequence: number;
  readonly pending?: { readonly measurement: Measurement; readonly remainingBytes: number };
}
interface PacketMemory {
  readonly packetValues?: Readonly<Record<string, readonly number[]>>;
  readonly nextOpticalProduct?: Product;
}
const encodedBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;
const decoded = (m: Measurement, product: Product) =>
  product === 'wells' ? decodeWellCameraFrame(m) : decodeLatticeFrame(m);
const memory = (state: ShipSystemsState, product: Product): ProductMemory =>
  (state.ext?.[product === 'wells' ? 'wellCamera' : 'latticeAcquisition'] as unknown as
    ProductMemory | undefined) ?? { sequence: 0 };

/** Independent byte ledger from saved work remaining and newly acquired wire products.
 * Completion timestamps are restored to acquisition for the original queued wire length. */
function retainedBytes(
  before: ShipSystemsState,
  after: ShipSystemsState,
  measurements: readonly Measurement[],
  product: Product,
) {
  const a = memory(before, product),
    b = memory(after, product);
  expect(b.sequence - a.sequence).toBeGreaterThanOrEqual(0);
  expect(b.sequence - a.sequence).toBeLessThanOrEqual(1);
  let acquiredBytes = 0;
  if (b.sequence > a.sequence) {
    const queued = b.pending?.measurement;
    const complete = measurements.find((m) => decoded(m, product)?.sequence === a.sequence);
    const acquired =
      queued && decoded(queued, product)?.sequence === a.sequence ? queued : complete;
    expect(acquired).toBeDefined();
    const acquisition = decoded(acquired!, product)!.acquisition;
    acquiredBytes = encodedBytes({ ...acquired!, t: acquisition[1] }) + 24;
  }
  return (a.pending?.remainingBytes ?? 0) + acquiredBytes - (b.pending?.remainingBytes ?? 0);
}

/** The existing compact ordinary-channel wire format, evaluated from emitted readings. */
function reservedBytes(before: ShipSystemsState, measurements: readonly Measurement[]) {
  const dictionary =
    (before.ext?.sensors as unknown as PacketMemory | undefined)?.packetValues ?? {};
  let bytes = 64;
  for (const m of measurements) {
    if (decodeLatticeFrame(m) || decodeWellCameraFrame(m)) continue;
    if (decodeLatticeDiagnostic(m)) {
      bytes += encodedBytes(m);
      continue;
    }
    if (decodeRadiationReading(m)) {
      bytes += RADIATION_MONITOR.bytesPerReading;
      continue;
    }
    const prior = dictionary[`${m.source}/${m.kind}/${m.channel ?? ''}/${m.target ?? ''}`];
    const payload = [...m.value, ...m.sigma];
    const repeated = prior?.length === payload.length && payload.every((n, i) => n === prior[i]);
    bytes += repeated
      ? 2
      : 8 + 8 * m.value.length + (m.sigma.some((n) => n !== 0) ? 8 * m.sigma.length : 0);
  }
  return bytes;
}

function environment(t: number, lattice = true, wells = true): EnvironmentEffects {
  const segments = Array.from({ length: 128 }, (_, i) => {
    const y = -50 + (i % 16) * 6,
      z = -30 + Math.floor(i / 16) * 8;
    return { a: { x: 250, y, z }, b: { x: 250, y: y + 4, z: z + 2 } };
  });
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
      [RADIATION_MONITOR.inputKey]: { kind: 'radiation-monitor-input-v1', t, rate: 0.05 },
      ...(lattice ? { lattice: { kind: 'lattice-scene-v1', segments } } : {}),
      ...(wells
        ? {
            wells: {
              kind: 'well-camera-scene-v1',
              t,
              valid: true,
              truncated: false,
              segments: segments.map(({ a, b }) => ({
                from: a,
                to: b,
                phase: 'active',
                adequateSignal: true,
              })),
            },
          }
        : {}),
    } as Record<string, JsonValue>,
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
  let state = initializeLatticeSensorStreams(
    createShipSystemsState(definition, 'shared-camera'),
    'shared-camera',
  );
  state = { ...state, t: 100, recorder: { ...state.recorder, sampleRate: 10 } };
  for (const id of ['fuel-cell-a', 'fuel-cell-b'])
    state = change(state, id, { values: { ...state.equipment[id]!.values, output: 6000 } });
  state = change(state, 'camera', {
    mode: 'detail',
    allocation: 200,
    values: { ...state.equipment.camera!.values, readyAt: 0 },
  });
  state = change(state, 'science-processor', { mode: 'lattice', allocation: 1000 });
  const powered = stepPower(state, definition, environment(100), 0.1).state;
  expect(powered.equipment.camera!.powerDraw).toBe(200);
  expect(powered.equipment['science-processor']!.powerDraw).toBe(1000);
  expect(powered.equipment['black-box']!.powerDraw).toBe(35);
  expect(powered.rng[WELL_CAMERA_STREAM]).toBeDefined();
  return powered;
}

const step = (state: ShipSystemsState, t: number, lattice = true, wells = true) =>
  stepSensors({ ...state, t }, definition, environment(t, lattice, wells), 0.1);
const frames = (measurements: readonly Measurement[], product: Product) =>
  measurements.map((m) => decoded(m, product)).filter((frame) => frame !== undefined);
function archive() {
  const setup = createChainLink('shared-camera-archive');
  return new AttemptRecorder({
    id: 'shared-camera-archive',
    index: 1,
    encounterId: 'chain-link',
    startedAt: '2026-11-15T00:00:00Z',
    start: {
      estimate: setup.definition.briefing.arrivalEstimate,
      configuration: setup.definition.briefing.arrivalConfiguration,
      modelVersion: 0,
      briefing: setup.definition.briefing,
    },
  });
}

describe('shared physical camera product dispatcher (R36)', () => {
  it('shares every actual packet after ordinary, radiation and raw-tile reservations, alternating progress', () => {
    const recorder = archive();
    const primed = step(initial(), 100);
    recorder.recordMeasurements(primed.measurements);
    let state = primed.state;
    let alternatingChecks = 0;
    const madeProgress = { wells: 0, lattice: 0 };
    for (let tick = 1; tick <= 60; tick++) {
      const result = step(state, 100 + tick / 10);
      const charged = result.state.recorder.bytesUsed - state.recorder.bytesUsed;
      expect(charged).toBe(baseline.recorder.bytesPerSample);
      const reserved = reservedBytes(state, result.measurements);
      const used = {
        lattice: retainedBytes(state, result.state, result.measurements, 'lattice'),
        wells: retainedBytes(state, result.state, result.measurements, 'wells'),
      };
      expect(used.lattice).toBeGreaterThanOrEqual(0);
      expect(used.wells).toBeGreaterThanOrEqual(0);
      expect(reserved + used.lattice + used.wells).toBeLessThanOrEqual(charged);
      const spare = charged - reserved;
      const first = (state.ext?.sensors as unknown as PacketMemory).nextOpticalProduct ?? 'lattice';
      if (
        spare > 0 &&
        (memory(state, 'lattice').pending?.remainingBytes ?? 0) >= spare &&
        (memory(state, 'wells').pending?.remainingBytes ?? 0) >= spare
      ) {
        expect(used[first]).toBe(spare);
        expect(used[first === 'wells' ? 'lattice' : 'wells']).toBe(0);
        alternatingChecks++;
      }
      expect((result.state.ext?.sensors as unknown as PacketMemory).nextOpticalProduct).toBe(
        first === 'wells' ? 'lattice' : 'wells',
      );
      if (used.wells > 0) madeProgress.wells++;
      if (used.lattice > 0) madeProgress.lattice++;
      recorder.recordMeasurements(result.measurements);
      state = result.state;
    }
    expect(alternatingChecks).toBeGreaterThan(10);
    expect(madeProgress.wells).toBeGreaterThan(10);
    expect(madeProgress.lattice).toBeGreaterThan(10);
    for (const product of ['wells', 'lattice'] as const) {
      const observed = frames(recorder.snapshot().measurements, product);
      expect(observed.length).toBeGreaterThanOrEqual(2);
      expect(
        observed.every(
          (f) => f.availableAt > f.acquisition[1] && f.coverage.status === 'unresolved',
        ),
      ).toBe(true);
    }
    expect(recorder.snapshot().measurements.some((m) => decodeLatticeDiagnostic(m))).toBe(true);
    expect(recorder.snapshot().measurements.some((m) => decodeRadiationReading(m))).toBe(true);
  });

  it('does not consume product bytes or rotate priority between real recorder packets', () => {
    const first = step(initial(), 100);
    expect(memory(first.state, 'wells').pending).toBeDefined();
    expect(memory(first.state, 'lattice').pending).toBeDefined();
    const result = step(first.state, 100.01);
    expect(result.measurements).toEqual([]);
    expect(result.state.recorder.bytesUsed).toBe(first.state.recorder.bytesUsed);
    for (const product of ['wells', 'lattice'] as const) {
      expect(retainedBytes(first.state, result.state, result.measurements, product)).toBe(0);
      expect(memory(result.state, product).pending).toEqual(memory(first.state, product).pending);
    }
    expect((result.state.ext?.sensors as unknown as PacketMemory).nextOpticalProduct).toBe(
      (first.state.ext?.sensors as unknown as PacketMemory).nextOpticalProduct,
    );
  });

  it('records well-only scenes through the real dispatcher without lattice hardware or fields', () => {
    let state = change(initial(), 'science-processor', { mode: 'off', powerDraw: 0 });
    const recorder = archive();
    for (let tick = 0; tick < 20; tick++) {
      const result = step(state, 100 + tick / 10, false, true);
      recorder.recordMeasurements(result.measurements);
      state = result.state;
    }
    const observed = recorder
      .snapshot()
      .measurements.map(decodeWellCameraFrame)
      .filter((frame) => frame !== undefined);
    expect(observed.length).toBeGreaterThan(0);
    expect(frames(recorder.snapshot().measurements, 'lattice')).toEqual([]);
    expect(observed.every((frame) => frame.contours.length > 0)).toBe(true);
  });

  it.each(['camera', 'recorder', 'storage', 'disabled'] as const)(
    'publishes no well evidence without available %s',
    (unavailable) => {
      let state = initial();
      if (unavailable === 'camera') state = change(state, 'camera', { powerDraw: 0 });
      if (unavailable === 'recorder') state = change(state, 'black-box', { powerDraw: 0 });
      if (unavailable === 'storage')
        state = {
          ...state,
          recorder: {
            ...state.recorder,
            bytesUsed: state.recorder.capacity - baseline.recorder.reservedEventCapacity,
          },
        };
      if (unavailable === 'disabled')
        state = { ...state, recorder: { ...state.recorder, sampleRate: 0 } };
      const beforeBytes = state.recorder.bytesUsed;
      for (let tick = 0; tick < 15; tick++) {
        const result = step(state, 100 + tick / 10, false, true);
        expect(frames(result.measurements, 'wells')).toEqual([]);
        state = result.state;
      }
      if (unavailable !== 'camera') expect(state.recorder.bytesUsed).toBe(beforeBytes);
    },
  );

  it('keeps old navigation streams independent from both optical product streams', () => {
    let combined = initial(),
      ordinary = initial();
    const optional = new Set([
      WELL_CAMERA_STREAM,
      LATTICE_SENSOR_STREAM,
      LATTICE_DIAGNOSTIC_STREAM,
      RADIATION_MONITOR.stream,
    ]);
    const navigation = new Set([
      'bearing',
      'range',
      'relative-position',
      'accel',
      'attitude',
      'rate',
    ]);
    for (let tick = 0; tick < 20; tick++) {
      const a = step(combined, 100 + tick / 10),
        b = step(ordinary, 100 + tick / 10, false, false);
      expect(a.measurements.filter((m) => navigation.has(m.kind))).toEqual(
        b.measurements.filter((m) => navigation.has(m.kind)),
      );
      combined = a.state;
      ordinary = b.state;
      for (const name of sensorStreamNames(definition).filter((name) => !optional.has(name)))
        expect(combined.rng[name]).toEqual(ordinary.rng[name]);
    }
    expect(combined.rng[WELL_CAMERA_STREAM]).not.toEqual(ordinary.rng[WELL_CAMERA_STREAM]);
    expect(combined.rng[LATTICE_SENSOR_STREAM]).not.toEqual(ordinary.rng[LATTICE_SENSOR_STREAM]);
  });

  it('resumes both partial products and packet priority exactly after a save, then replays the archive', () => {
    const recorder = archive();
    const first = step(initial(), 100);
    recorder.recordMeasurements(first.measurements);
    expect(memory(first.state, 'wells').pending).toBeDefined();
    expect(memory(first.state, 'lattice').pending).toBeDefined();
    let state = first.state,
      restored = JSON.parse(JSON.stringify(state)) as ShipSystemsState;
    for (let tick = 1; tick < 30; tick++) {
      const result = step(state, 100 + tick / 10),
        replayed = step(restored, 100 + tick / 10);
      expect(replayed).toEqual(result);
      recorder.recordMeasurements(result.measurements);
      state = result.state;
      restored = replayed.state;
    }
    const replay = archive();
    replay.recordMeasurements(JSON.parse(JSON.stringify(recorder.snapshot().measurements)));
    expect(replay.snapshot().measurements).toEqual(recorder.snapshot().measurements);
    expect(frames(replay.snapshot().measurements, 'wells').length).toBeGreaterThan(0);
    expect(frames(replay.snapshot().measurements, 'lattice').length).toBeGreaterThan(0);
  });

  it.each(['black-box', 'camera'] as const)(
    'handles pending well memory across %s reboot after the visible scene disappears',
    (host) => {
      const recorder = archive();
      const first = step(initial(), 100, false, true);
      recorder.recordMeasurements(first.measurements);
      const original = memory(first.state, 'wells').pending!;
      expect(original).toBeDefined();
      expect(decodeWellCameraFrame(original.measurement)!.acquisition).toEqual([100, 100]);
      let state = change(first.state, host, {
        values: { ...first.state.equipment[host]!.values, radiationRestartUntil: 100.5 },
      });
      for (let tick = 1; tick < 5; tick++) {
        const result = step(state, 100 + tick / 10, false, false);
        expect(frames(result.measurements, 'wells')).toEqual([]);
        recorder.recordMeasurements(result.measurements);
        state = result.state;
      }
      if (host === 'black-box') expect(memory(state, 'wells').pending).toEqual(original);
      else expect(memory(state, 'wells').pending).toBeUndefined();
      for (let tick = 5; tick < 20; tick++) {
        const result = step(state, 100 + tick / 10, false, false);
        recorder.recordMeasurements(result.measurements);
        state = result.state;
      }
      const retained = frames(recorder.snapshot().measurements, 'wells');
      expect(retained).toHaveLength(host === 'black-box' ? 1 : 0);
      if (host === 'black-box') {
        expect(retained[0]!.acquisition).toEqual([100, 100]);
        expect(retained[0]!.availableAt).toBeGreaterThanOrEqual(100.5);
        expect(retained[0]!.availableAt).toBeGreaterThan(retained[0]!.acquisition[1]);
      }
      const replay = archive();
      replay.recordMeasurements(JSON.parse(JSON.stringify(recorder.snapshot().measurements)));
      expect(replay.snapshot().measurements).toEqual(recorder.snapshot().measurements);
    },
  );
});
