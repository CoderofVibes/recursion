import { describe, expect, it } from 'vitest';
import type { Measurement } from '../../contracts/measurements.ts';
import type { EnvironmentEffects, ShipSystemsState } from '../../contracts/truth/ship.ts';
import type { JsonValue } from '../../contracts/units.ts';
import { AttemptRecorder } from '../../blackbox/recorder.ts';
import { createInverseWells } from '../../content/inverse-wells/index.ts';
import { funnelOpticalSegments } from '../../content/inverse-wells/optics.ts';
import { funnelSpec } from '../../sim/fields/wells.ts';
import { fromRotationVector, rotate } from '../../lib/quat.ts';
import * as v3 from '../../lib/vec3.ts';
import { getGeometry } from '../config/index.ts';
import { loadShipDefinition } from '../definition.ts';
import { createShipSystemsState } from '../state.ts';
import { stepShipSystems } from '../index.ts';
import { stepPower } from '../power/index.ts';
import { stepSensors } from './index.ts';
import {
  decodeWellCameraFrame,
  encodeWellCameraFrame,
  wellCameraFrameFreshness,
} from './wells-observations.ts';
import {
  initializeWellCameraStream,
  stepWellAcquisition,
  wellCameraSchedule,
  WELL_CAMERA_STREAM,
  WELL_CAMERA_LIMITS,
  type WellsSensorScene,
} from './wells.ts';

const definition = loadShipDefinition();
function initial(): ShipSystemsState {
  const state = initializeWellCameraStream(
    createShipSystemsState(definition, 'wells-camera'),
    'wells-camera',
  );
  return {
    ...state,
    t: 100,
    equipment: {
      ...state.equipment,
      camera: { ...state.equipment.camera!, powerDraw: 120, values: { readyAt: 0 } },
      'black-box': { ...state.equipment['black-box']!, powerDraw: 35 },
    },
  };
}
function change(
  state: ShipSystemsState,
  id: string,
  patch: Partial<ShipSystemsState['equipment'][string]>,
): ShipSystemsState {
  return {
    ...state,
    equipment: { ...state.equipment, [id]: { ...state.equipment[id]!, ...patch } },
  };
}
const scene = (t = 100): WellsSensorScene => ({
  kind: 'well-camera-scene-v1',
  t,
  valid: true,
  truncated: false,
  segments: [
    {
      from: { x: 1000, y: -100, z: 20 },
      to: { x: 1000, y: 100, z: 20 },
      phase: 'precursor',
      adequateSignal: true,
    },
  ],
});
function environment(t = 100, light = scene(t)): EnvironmentEffects {
  return {
    t,
    kinematics: {
      position: v3.ZERO,
      velocity: v3.ZERO,
      attitude: fromRotationVector(v3.ZERO),
      angularVelocity: v3.ZERO,
    },
    specificForce: v3.ZERO,
    targets: [],
    intensity: {},
    sunlight: { direction: v3.UNIT_Y, irradiance: 100 },
    fieldSignals: {
      'ship-environment': { opticsValid: true },
      wells: light as unknown as JsonValue,
    },
  };
}
const acquire = (s = initial(), e = environment(), budget = 16384, dt = 0.1, rate = 10) =>
  stepWellAcquisition(s, definition, e, dt, budget, rate);
const frame = (s = initial(), e = environment()) =>
  decodeWellCameraFrame(acquire(s, e).measurements[0]!)!;

/** Real dispatch keeps leakage in electrical draw and heat, outside useful camera work. */
function dispatchedCamera(allocation: number, leakage = 0.25): ShipSystemsState {
  let s = initial();
  for (const id of Object.keys(s.equipment).filter((id) => id.startsWith('fuel-cell')))
    s = change(s, id, { values: { ...s.equipment[id]!.values, output: 6000 } });
  s = change(s, 'camera', {
    mode: 'detail',
    allocation,
    values: { ...s.equipment.camera!.values, radiationLeakage: leakage },
  });
  const delivered = stepPower(s, definition, environment(), 0.1).state;
  expect(delivered.equipment.camera!.powerDraw).toBeCloseTo(allocation * (1 + leakage), 10);
  expect(delivered.equipment.camera!.values.heat).toBeCloseTo(allocation * (1 + leakage), 10);
  return delivered;
}

describe('R36 funnel camera hardware and recorded evidence', () => {
  it('acquires S22 funnel contours independently of hidden ID, pull and activation status', () => {
    const sample = { stations: [0, 0.5, 1], azimuthSegments: 8 };
    const light = (id: string, active: boolean): WellsSensorScene => ({
      ...scene(),
      segments: funnelOpticalSegments(
        funnelSpec(
          id,
          { x: 350_000, y: 0, z: 0 },
          v3.normalize({ x: 0.1, y: 0.3, z: 0.8 }),
          active ? { phase: 'active', activeSince: -500 } : { phase: 'pending' },
        ),
        sample,
      ).map(({ from, to }) => ({ from, to, phase: 'precursor', adequateSignal: true })),
    });
    // Explicit supplied adequate emission is a fixture, NOT proof of 350 km sensitivity.
    const first = frame(initial(), environment(100, light('hidden-a', false)));
    const second = frame(initial(), environment(100, light('hidden-b', true)));
    expect(first.contours.length).toBeGreaterThan(10);
    expect(second).toEqual(first);
  });
  it('records anonymous uncertain contour bearings and visible phase, never truth geometry', () => {
    const r = acquire(),
      f = decodeWellCameraFrame(r.measurements[0]!)!;
    expect(f.contours).toHaveLength(1);
    expect(f.contours[0]!.phase).toBe('precursor');
    expect(f.contours[0]!.start[0]).toBeCloseTo(-0.1, 2);
    expect(f.basisSigma).toBeGreaterThan(0);
    expect(f.basis).not.toEqual({ forward: v3.UNIT_X, right: v3.UNIT_Y, up: v3.UNIT_Z });
    expect(f.coverage.status).toBe('unresolved');
    expect(encodeWellCameraFrame(f)).toEqual(r.measurements[0]);
    expect(acquire()).toEqual(r);
  });
  it('spends only its supplied bytes and never changes the physical recorder account', () => {
    const s = initial(),
      r = acquire(s);
    expect(r.state.recorder).toBe(s.recorder);
    expect(r.bytes).toBeGreaterThan(0);
    expect(r.bytes).toBeLessThanOrEqual(16384);
    const text = JSON.stringify(r.measurements);
    for (const key of [
      'mouth',
      'axis',
      'radius',
      'pull',
      'reversal',
      'site',
      'seed',
      'position',
      'attitude',
    ])
      expect(text).not.toContain(`"${key}"`);
  });
  it.each([
    ['no delivered power', { powerDraw: 0 }],
    ['below tracking power', { powerDraw: 59 }],
    ['off', { mode: 'off' }],
    ['dead', { condition: 0 }],
    ['tripped', { tripped: true }],
    ['warming', { values: { readyAt: 101 } }],
    ['rebooting', { values: { radiationRestartUntil: 101 } }],
    ['thermally inhibited', { values: { thermalInhibited: 1 } }],
  ] as const)('does not acquire or draw noise while camera is %s', (_name, patch) => {
    const s = change(initial(), 'camera', patch),
      r = acquire(s);
    expect(r.measurements).toEqual([]);
    expect(r.state.rng).toBe(s.rng);
  });
  it('uses actual thermal node, pointing settlement and optical validity', () => {
    const s = initial(),
      node = definition.equipment.find((e) => e.id === 'camera')!.thermalNode!;
    for (const state of [
      { ...s, thermal: { ...s.thermal, [node]: 313 } },
      { ...s, ext: { ...s.ext, sensorPointing: { camera: { settleUntil: 101 } } } },
    ])
      expect(acquire(state).measurements).toEqual([]);
    const e = environment();
    expect(
      acquire(s, {
        ...e,
        fieldSignals: { ...e.fieldSignals, 'ship-environment': { opticsValid: false } },
      }).measurements,
    ).toEqual([]);
  });
  it('needs a functioning recorder, but separate attitude sensors do not create camera truth', () => {
    for (const patch of [{ powerDraw: 0 }, { mode: 'off' }, { condition: 0 }, { tripped: true }])
      expect(acquire(change(initial(), 'black-box', patch)).measurements).toEqual([]);
    let s = initial();
    for (const id of ['star-tracker-a', 'star-tracker-b', 'imu-a', 'imu-b'])
      s = change(s, id, { mode: 'off', powerDraw: 0 });
    expect(frame(s).contours).toHaveLength(1);
    expect(frame(s).basisCorrelation).toBe('frame-common-rotation');
  });
  it('uses delivered camera power and recorder cadence, with finite exposure and condition uncertainty', () => {
    expect(wellCameraSchedule(initial(), definition, environment(), 10).rate).toBe(1);
    expect(
      wellCameraSchedule(
        change(initial(), 'camera', { powerDraw: 60 }),
        definition,
        environment(),
        10,
      ).rate,
    ).toBe(0.5);
    expect(
      wellCameraSchedule(
        change(initial(), 'camera', { powerDraw: 200 }),
        definition,
        environment(),
        10,
      ).rate,
    ).toBe(5 / 3);
    expect(wellCameraSchedule(initial(), definition, environment(), 0.2).rate).toBe(0.2);
    const base = frame(),
      lower = frame(change(initial(), 'camera', { powerDraw: 60 }));
    expect(lower.basisSigma / base.basisSigma).toBeCloseTo(Math.SQRT2, 14);
    const worn = frame(change(initial(), 'camera', { condition: 0.5 }));
    expect(worn.basisSigma / base.basisSigma).toBe(2);
    const exposed = frame(change(initial(), 'camera', { values: { readyAt: 0, exposure: 0.2 } }));
    expect(exposed.basisSigma / base.basisSigma).toBeCloseTo(0.5, 14);
    const hiddenDamage = frame(
      change(initial(), 'camera', { condition: 0.5, values: { readyAt: 0, reportedCondition: 1 } }),
    );
    expect(hiddenDamage.basisSigma).toBe(base.basisSigma);
    expect(hiddenDamage.basis).not.toEqual(base.basis);
  });
  it('rejects dark, off-axis, unresolved and smeared contour support without certifying clear space', () => {
    const dark = {
      ...scene(),
      segments: scene().segments.map((s) => ({ ...s, adequateSignal: false })),
    };
    const rear = {
      ...scene(),
      segments: scene().segments.map((s) => ({
        ...s,
        from: v3.scale(s.from, -1),
        to: v3.scale(s.to, -1),
      })),
    };
    const tiny = {
      ...scene(),
      segments: [{ ...scene().segments[0]!, to: { x: 1000, y: -99.999, z: 20 } }],
    };
    const e = environment();
    const cases = [
      environment(100, dark),
      environment(100, rear),
      environment(100, tiny),
      { ...e, kinematics: { ...e.kinematics, velocity: { x: 0, y: 100, z: 0 } } },
      { ...e, kinematics: { ...e.kinematics, angularVelocity: { x: 0, y: 0, z: 1 } } },
    ];
    for (const env of cases) {
      const f = frame(initial(), env);
      expect(f.contours).toEqual([]);
      expect(f.coverage.status).toBe('unresolved');
    }
  });
  it('preserves both sides of a partial occlusion and does not see through a foreground body', () => {
    const s = initial(),
      e = environment();
    const camera = v3.sub(
      getGeometry(s, definition).positions.camera!,
      s.massProperties.centerOfMass,
    );
    const center = v3.lerp(camera, { x: 1000, y: 0, z: 20 }, 0.5);
    const target = {
      id: 'occluder',
      kind: 'body' as const,
      relativePosition: center,
      relativeVelocity: v3.ZERO,
      radius: 15,
    };
    const f = frame(s, { ...e, targets: [target] });
    expect(f.contours).toHaveLength(2);
    expect(f.contours[0]!.end[0]).toBeLessThan(-0.02);
    expect(f.contours[1]!.start[0]).toBeGreaterThan(0.02);
    expect(frame(s, { ...e, targets: [{ ...target, radius: 100 }] }).contours).toEqual([]);
  });
  it('uses the configured aperture and COM at an arbitrary attitude, without exposing that attitude', () => {
    const s = initial(),
      e = environment(),
      q = fromRotationVector({ x: 0.3, y: 0.5, z: -1 });
    const offset = { x: 12000, y: -1800, z: 2500 };
    const light = {
      ...scene(),
      segments: scene().segments.map((segment) => ({
        ...segment,
        from: v3.add(rotate(q, segment.from), offset),
        to: v3.add(rotate(q, segment.to), offset),
      })),
    };
    const moved = frame(s, {
      ...environment(100, light),
      kinematics: { ...e.kinematics, position: offset, attitude: q },
    });
    const original = frame(s);
    original.contours[0]!.start.forEach((n, i) =>
      expect(moved.contours[0]!.start[i]).toBeCloseTo(n, 13),
    );
    expect(moved.basis).toEqual(original.basis);
    const shifted = frame({
      ...s,
      massProperties: { ...s.massProperties, centerOfMass: { x: 0, y: 20, z: 0 } },
    });
    expect(shifted.contours[0]!.start[0]).not.toBeCloseTo(original.contours[0]!.start[0], 3);
  });
  it('retains a complete frame over multiple real packet budgets and preserves acquisition time', () => {
    let s = initial(),
      consumed = 0;
    const one = acquire(s),
      expectedBytes = one.bytes;
    for (let i = 0; i < 100; i++) {
      const t = 100 + i * 0.001,
        r = acquire(s, environment(t), 37);
      s = r.state;
      consumed += r.bytes;
      expect(r.bytes).toBeLessThanOrEqual(37);
      if (r.measurements.length) {
        expect(consumed).toBe(expectedBytes);
        const f = decodeWellCameraFrame(r.measurements[0]!)!;
        expect(f.acquisition).toEqual([100, 100]);
        expect(f.availableAt).toBe(t);
        expect(f.availableAt).toBeGreaterThan(100);
        return;
      }
    }
    throw new Error('frame not completely retained');
  });
  it('keeps pending acquisition across save/restore, drops on camera loss and never backfills', () => {
    const first = acquire(initial(), environment(), 1);
    expect(first.measurements).toEqual([]);
    const restored = JSON.parse(JSON.stringify(first.state)) as ShipSystemsState;
    expect(acquire(restored, environment(100.1))).toEqual(acquire(first.state, environment(100.1)));
    const dead = acquire(change(first.state, 'camera', { powerDraw: 0 }), environment(100.1));
    expect(dead.measurements).toEqual([]);
    expect(
      acquire(change(dead.state, 'camera', { powerDraw: 120 }), environment(100.2)).measurements,
    ).toEqual([]);
    const later = acquire(restored, environment(160), 16384, 60);
    expect(later.measurements.map((m) => decodeWellCameraFrame(m)!.acquisition)).toEqual([
      [100, 100],
      [160, 160],
    ]);
    expect(later.measurements.every((m) => m.t === 160)).toBe(true);
  });
  it('drops overflow acquisitions without consuming noise, and rejects stale scenes', () => {
    const pending = acquire(initial(), environment(), 0);
    const full = acquire(pending.state, environment(101), 0);
    expect(full.state.rng).toBe(pending.state.rng);
    expect((full.state.ext!.wellCamera as { droppedFrames: number }).droppedFrames).toBe(1);
    expect(() => acquire(initial(), environment(101, scene(100)))).toThrow(/CURRENT/);
    expect(() => acquire(initial(), environment(), -1)).toThrow(/budget/);
    expect(() => acquire(initial(), environment(), 1, 1, NaN)).toThrow(/rate/);
  });
  it('initializes once, preserves other streams and leaves ordinary sensors independent', () => {
    const s = initial();
    expect(initializeWellCameraStream(s, 'different')).toBe(s);
    const r = acquire(s);
    for (const key of Object.keys(s.rng).filter((k) => k !== WELL_CAMERA_STREAM))
      expect(r.state.rng[key]).toBe(s.rng[key]);
    const afterCapture = stepSensors(r.state, definition, environment(), 0.1);
    const fresh = stepSensors(s, definition, environment(), 0.1);
    const ordinary = (m: Measurement) => !decodeWellCameraFrame(m);
    expect(afterCapture.measurements.filter(ordinary)).toEqual(fresh.measurements.filter(ordinary));
    expect(afterCapture.measurements.filter((m) => decodeWellCameraFrame(m))).toEqual([]);
    expect(fresh.measurements.filter((m) => decodeWellCameraFrame(m))).toEqual(r.measurements);
  });
  it('bounds frame size and rotates extraction so dense support is not permanently starved', () => {
    let s = initial();
    const observed = new Set<number>();
    const light: WellsSensorScene = {
      ...scene(),
      segments: Array.from({ length: 180 }, (_, i) => ({
        from: { x: 1000, y: -80, z: -90 + i },
        to: { x: 1000, y: 80, z: -90 + i },
        phase: 'active',
        adequateSignal: true,
      })),
    };
    const apertureZ =
      getGeometry(s, definition).positions.camera!.z - s.massProperties.centerOfMass.z;
    for (let i = 0; i < 12; i++) {
      const r = acquire(s, environment(100 + i, { ...light, t: 100 + i }));
      s = r.state;
      const f = decodeWellCameraFrame(r.measurements[0]!)!;
      expect(f.coverage.truncated).toBe(true);
      expect(f.contours.length).toBeLessThanOrEqual(WELL_CAMERA_LIMITS.maxContours);
      expect(r.bytes).toBeLessThanOrEqual(WELL_CAMERA_LIMITS.maxFrameBytes);
      const depth =
        1000 - (getGeometry(s, definition).positions.camera!.x - s.massProperties.centerOfMass.x);
      f.contours.forEach((c) =>
        observed.add(Math.round(((c.start[1] + c.end[1]) / 2) * depth + apertureZ + 90)),
      );
    }
    expect(observed.size).toBe(180);
  });
  it('uses delivered ship power and ordinary warmup before recording through the dispatcher', () => {
    let s = initializeWellCameraStream(createShipSystemsState(definition, 'pipeline'), 'pipeline');
    let first: number | undefined;
    for (let t = 0; t < 36; t++) {
      const e = environment(t);
      const r = stepShipSystems(s, definition, [], e, 1);
      s = r.state;
      const frames = r.measurements.flatMap((m) => decodeWellCameraFrame(m) ?? []);
      if (t < 30) expect(frames).toEqual([]);
      for (const f of frames) {
        first ??= f.acquisition[0];
        expect(f.acquisition[0]).toBeGreaterThanOrEqual(30);
        expect(f.availableAt).toBe(t);
      }
    }
    expect(first).toBe(30);
    expect(s.equipment.camera!.powerDraw).toBeGreaterThanOrEqual(60);
    expect(s.recorder.bytesUsed).toBeGreaterThan(0);
  });
  it('does not let 50 useful watts plus leakage cross the 60 W camera threshold', () => {
    const s = dispatchedCamera(50);
    expect(s.equipment.camera!.powerDraw).toBe(62.5);
    expect(wellCameraSchedule(s, definition, environment(), 10).rate).toBe(0);
    expect(acquire(s).measurements).toEqual([]);
    const recorded = stepSensors(s, definition, environment(), 0.1).measurements;
    expect(recorded.some((m) => decodeWellCameraFrame(m))).toBe(false);
    expect(recorded.find((m) => m.channel === 'camera.power')!.value).toEqual([62.5]);
  });
  it('keeps the 96 useful watt camera at 0.8 Hz despite 120 W total draw', () => {
    const s = dispatchedCamera(96);
    const r = acquire(s);
    const f = decodeWellCameraFrame(r.measurements[0]!)!;
    expect(f.effectiveRate).toBe(0.8);
    expect(f.cameraPower).toBe(120);
    expect(wellCameraSchedule(r.state, definition, environment(101), 10).due).toBe(false);
    expect(wellCameraSchedule(r.state, definition, environment(101.25), 10).due).toBe(true);
  });
  it('cannot buy better contour or pointing accuracy by burning leakage power', () => {
    const clean = frame(dispatchedCamera(100, 0));
    const leaking = frame(dispatchedCamera(100));
    expect(clean.cameraPower).toBe(100);
    expect(leaking.cameraPower).toBe(125);
    expect(clean.contours.length).toBeGreaterThan(0);
    expect(leaking).toEqual({ ...clean, cameraPower: 125 });
  });
  it('loses volatile imagery when useful power falls below tracking despite leakage draw', () => {
    const pending = acquire(initial(), environment(), 0);
    const weak = dispatchedCamera(50);
    const lost = acquire({ ...pending.state, equipment: weak.equipment }, environment(100.1));
    expect(lost.measurements).toEqual([]);
    const recovered = acquire(
      { ...lost.state, equipment: initial().equipment },
      environment(100.2),
    );
    expect(recovered.measurements).toEqual([]);
    expect(recovered.state.rng).toEqual(pending.state.rng);
  });
  it('records retained camera products in the real AttemptRecorder and survives JSON archive', () => {
    const setup = createInverseWells('camera-record');
    const recorder = new AttemptRecorder({
      id: 'camera-attempt',
      index: 1,
      encounterId: setup.definition.briefing.id,
      startedAt: '2026-11-15T00:00:00Z',
      start: {
        estimate: setup.definition.briefing.arrivalEstimate,
        configuration: setup.definition.briefing.arrivalConfiguration,
        modelVersion: 0,
        briefing: setup.definition.briefing,
      },
    });
    const pending = acquire(initial(), environment(), 0);
    recorder.recordMeasurements(pending.measurements);
    expect(recorder.snapshot().measurements).toEqual([]);
    const complete = acquire(pending.state, environment(100.5));
    recorder.recordMeasurements(complete.measurements);
    const snapshot = recorder.snapshot();
    const archive = JSON.parse(JSON.stringify(snapshot)) as typeof snapshot;
    expect(archive.measurements).toEqual(complete.measurements);
    const f = decodeWellCameraFrame(archive.measurements[0]!)!;
    expect(f.acquisition).toEqual([100, 100]);
    expect(f.availableAt).toBe(100.5);
    expect(wellCameraFrameFreshness(f, 100.4, 10)).toBe('stale');
    expect(wellCameraFrameFreshness(f, 100.5, 1)).toBe('fresh');
    expect(wellCameraFrameFreshness(f, 102, 1)).toBe('stale');
  });
});

describe('strict well camera wire codec', () => {
  const encoded = () => acquire().measurements[0]!;
  it.each([
    [0, 2],
    [1, -1],
    [2, 101],
    [3, 101],
    [4, 0],
    [7, Math.PI],
    [8, 0],
    [9, 2],
    [10, 4],
    [19, 65],
    [20, Infinity],
    [24, 0],
    [25, 1],
    [30, 9],
  ])('rejects malformed scalar at wire offset %s', (index, value) => {
    const m = encoded(),
      a = [...m.value];
    a[index!] = value!;
    expect(decodeWellCameraFrame({ ...m, value: a })).toBeUndefined();
  });
  it('rejects contradictory uncertainty, wrong channel and truncated dimensions', () => {
    const m = encoded();
    const sigma = [...m.sigma];
    sigma[20] = 0;
    expect(decodeWellCameraFrame({ ...m, sigma })).toBeUndefined();
    expect(decodeWellCameraFrame({ ...m, value: m.value.slice(0, -1) })).toBeUndefined();
    expect(decodeWellCameraFrame({ ...m, channel: 'other' } as Measurement)).toBeUndefined();
  });
});
