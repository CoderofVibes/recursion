import { describe, expect, it } from 'vitest';
import baseline from '../../../data/ship-baseline.json';
import type { EnvironmentEffects, ShipSystemsState } from '../../contracts/truth/ship.ts';
import { fromYaw } from '../../lib/quat.ts';
import { loadShipDefinition } from '../definition.ts';
import { createShipSystemsState } from '../state.ts';
import { stepShipSystems } from '../index.ts';
import { createChainLink } from '../../content/chain-link/index.ts';
import { createChainLinkEnvironment } from '../../content/chain-link/environment.ts';
import { createSimulation } from '../../sim/index.ts';
import { AttemptRecorder } from '../../blackbox/recorder.ts';
import { stepSensors } from './index.ts';
import {
  decodeLatticeFrame,
  encodeLatticeFrame,
  latticeFrameFreshness,
} from './lattice-observations.ts';
import {
  initializeLatticeSensorStreams,
  latticeProcessingRate,
  stepLatticeAcquisition,
} from './lattice.ts';

const definition = loadShipDefinition();
function initial(): ShipSystemsState {
  const start = initializeLatticeSensorStreams(
    createShipSystemsState(definition, 'lattice-test'),
    'lattice-test',
  );
  return {
    ...start,
    t: 100,
    equipment: Object.fromEntries(
      Object.entries(start.equipment).map(([id, e]) => [
        id,
        {
          ...e,
          powerDraw:
            id === 'camera'
              ? 200
              : id === 'black-box'
                ? 35
                : id === 'science-processor'
                  ? 1000
                  : id.startsWith('star-tracker')
                    ? 20
                    : id.startsWith('imu')
                      ? 15
                      : e.powerDraw,
          mode: id === 'science-processor' ? 'lattice' : id === 'camera' ? 'detail' : e.mode,
          values: { ...e.values, readyAt: 0 },
        },
      ]),
    ),
  };
}
function environment(t = 100): EnvironmentEffects {
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
      lattice: {
        kind: 'lattice-scene-v1',
        segments: [{ a: { x: 127, y: -24, z: 0 }, b: { x: 127, y: 24, z: 0 } }],
      },
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
const acquire = (s = initial(), e = environment(), budget = 16384, dt = 0.1) =>
  stepLatticeAcquisition(s, definition, e, dt, budget, 10);

describe('lattice acquisition from installed hardware (A16, S17, P11/P12)', () => {
  it('honors S17 delivered-power rates and the existing 5/3 Hz camera ceiling', () => {
    expect(latticeProcessingRate(349, 200, 10)).toBe(0);
    expect(latticeProcessingRate(350, 200, 10)).toBe(0.2);
    expect(latticeProcessingRate(1000, 200, 10)).toBe(5 / 3);
    expect(latticeProcessingRate(1000, 120, 10)).toBe(1);
    expect(latticeProcessingRate(1000, 200, 0.5)).toBe(0.5);
    expect(latticeProcessingRate(1000, 59, 10)).toBe(0);
  });

  it('records anonymous uncertain image slopes, never world points, pose, seed or strand IDs', () => {
    const r = acquire();
    expect(r.measurements).toHaveLength(1);
    const f = decodeLatticeFrame(r.measurements[0]!)!;
    expect(f.fragments).toHaveLength(4);
    expect(f.coverage.status).toBe('unresolved');
    expect(f.fragments[0]!.sigma).toBe(0.0005);
    expect(f.acquisition).toEqual([100, 100]);
    expect(encodeLatticeFrame(f)).toEqual(r.measurements[0]);
    const text = JSON.stringify(r.measurements);
    for (const key of ['position', 'attitude', 'segments', 'layer', 'seed', '127'])
      expect(text).not.toContain(`"${key}"`);
    expect(acquire().measurements).toEqual(r.measurements);
  });

  it('retains a full frame across real packets before publishing any of it', () => {
    let s = initial();
    const first = acquire(s, environment(), 100);
    expect(first.measurements).toEqual([]);
    s = first.state;
    for (let i = 1; i <= 20; i++) {
      const r = acquire(s, environment(100 + i * 0.01), 100);
      s = r.state;
      if (r.measurements.length) {
        // Product validity is completion; raw ray acquisition remains exactly the original instant.
        expect(r.measurements[0]!.t).toBe(100 + i * 0.01);
        const frame = decodeLatticeFrame(r.measurements[0]!)!;
        expect(frame.acquisition).toEqual([100, 100]);
        expect(frame.availableAt).toBe(100 + i * 0.01);
        expect(frame.fragments).toHaveLength(4);
        return;
      }
    }
    throw new Error('Frame was never completely retained');
  });

  it('does not backfill lost snapshots or invent a historical exposure interval', () => {
    const r = acquire(initial(), environment(), 16384, 60);
    expect(r.measurements).toHaveLength(1);
    expect(decodeLatticeFrame(r.measurements[0]!)!.acquisition).toEqual([100, 100]);
    expect(acquire(r.state, environment(100.1)).measurements).toEqual([]);
    expect(acquire(r.state, environment(160)).measurements).toHaveLength(1);
  });

  it.each([
    ['camera', { powerDraw: 59 }],
    ['science-processor', { powerDraw: 349 }],
    ['science-processor', { mode: 'idle' }],
    ['black-box', { powerDraw: 0 }],
    ['camera', { condition: 0 }],
    ['camera', { tripped: true }],
    ['camera', { values: { readyAt: 101 } }],
  ] as const)('does not produce geometry without available %s hardware', (id, patch) => {
    const s = change(initial(), id, patch);
    const r = acquire(s);
    expect(r.measurements).toEqual([]);
    expect(r.state.rng).toEqual(s.rng);
  });

  it('rejects missing attitude, unpowered redundant IMUs, thermal cutout and warmup/settling', () => {
    const s = initial();
    const noImu = change(change(s, 'imu-a', { powerDraw: 1 }), 'imu-b', { powerDraw: 1 });
    expect(acquire(noImu).measurements).toEqual([]);
    expect(acquire({ ...s, thermal: { ...s.thermal, service: 313 } }).measurements).toEqual([]);
    expect(
      acquire({ ...s, ext: { sensorPointing: { camera: { settleUntil: 101 } } } }).measurements,
    ).toEqual([]);
    const env = environment();
    expect(
      acquire(s, {
        ...env,
        fieldSignals: { ...env.fieldSignals, 'ship-environment': { starsVisible: false } },
      }).measurements,
    ).toEqual([]);
  });

  it('keeps occluded, out-of-cone and out-of-range space unresolved, never clear', () => {
    const env = environment();
    const blocked = {
      ...env,
      targets: [
        {
          id: 'rock',
          kind: 'asteroid' as const,
          relativePosition: { x: 60, y: 0, z: 0 },
          relativeVelocity: { x: 0, y: 0, z: 0 },
          radius: 30,
        },
      ],
    };
    const frames = [
      acquire(initial(), blocked),
      acquire(initial(), { ...env, kinematics: { ...env.kinematics, attitude: fromYaw(Math.PI) } }),
      acquire(initial(), {
        ...env,
        kinematics: { ...env.kinematics, position: { x: -5000, y: 0, z: 0 } },
      }),
    ];
    for (const result of frames) {
      const f = decodeLatticeFrame(result.measurements[0]!)!;
      expect(f.fragments).toEqual([]);
      expect(f.coverage.status).toBe('unresolved');
    }
  });

  it('preserves exact save/restore, and ages recorded data without deleting it', () => {
    const first = acquire();
    const restored = JSON.parse(JSON.stringify(first.state)) as ShipSystemsState;
    expect(acquire(restored, environment(101))).toEqual(acquire(first.state, environment(101)));
    const f = decodeLatticeFrame(first.measurements[0]!)!;
    expect(latticeFrameFreshness(f, 100, 2)).toBe('fresh');
    expect(latticeFrameFreshness(f, 103, 2)).toBe('stale');
    expect(f.fragments).toHaveLength(4);
  });

  it('never rescues a partially recorded frame after its processing memory loses power', () => {
    const first = acquire(initial(), environment(), 1);
    expect(first.measurements).toEqual([]);
    const blackout = acquire(
      change(first.state, 'science-processor', { powerDraw: 0 }),
      environment(100.1),
    );
    expect(blackout.measurements).toEqual([]);
    const restored = acquire(
      change(blackout.state, 'science-processor', { powerDraw: 1000 }),
      environment(100.2),
    );
    expect(restored.measurements).toEqual([]);
  });

  it('uses the real ship power, warmup, recording and thermal pipeline with the authored field', () => {
    const setup = createChainLink('sensor-production', { catalogueIndex: 0 });
    const sim = createSimulation(setup.definition.world, {
      dt: setup.definition.dt,
      registry: setup.fieldRegistry,
    });
    const env = createChainLinkEnvironment(setup);
    const header = {
      id: 'lattice-recorder',
      index: 1,
      encounterId: setup.definition.briefing.id,
      startedAt: '2026-11-14T00:00:00Z',
      start: {
        estimate: setup.definition.briefing.arrivalEstimate,
        configuration: setup.definition.briefing.arrivalConfiguration,
        modelVersion: 0,
        briefing: setup.definition.briefing,
      },
    };
    const recorder = new AttemptRecorder(header);
    let state = sim.initial;
    const observed = [];
    for (let tick = 0; tick < 360; tick++) {
      const ship = stepShipSystems(
        state.world.ship.systems,
        setup.definition.ship,
        tick === 0
          ? [
              { kind: 'mode', equipment: 'camera', mode: 'detail' },
              { kind: 'power', equipment: 'camera', allocation: 200 },
              { kind: 'mode', equipment: 'science-processor', mode: 'lattice' },
              { kind: 'power', equipment: 'science-processor', allocation: 1000 },
              { kind: 'recorder', sampleRate: 10 },
            ]
          : [],
        env.at(state),
        sim.dt,
      );
      // The production recorder rejects decreasing timestamps, including within this batch.
      recorder.recordMeasurements(ship.measurements);
      for (const m of ship.measurements) {
        const frame = decodeLatticeFrame(m);
        if (frame) observed.push(frame);
      }
      state = sim.step(state, { systems: ship.state, actuators: ship.actuators }).state;
    }
    expect(
      observed.length,
      JSON.stringify({
        memory: state.world.ship.systems.ext?.latticeAcquisition,
        equipment: ['camera', 'science-processor', 'imu-a', 'star-tracker-a', 'black-box'].map(
          (id) => state.world.ship.systems.equipment[id],
        ),
      }),
    ).toBeGreaterThan(0);
    expect(
      observed.every((f) => f.acquisition[0] >= 30 && f.acquisition[0] === f.acquisition[1]),
    ).toBe(true);
    expect(observed.some((f) => f.fragments.length > 0)).toBe(true);
    expect(observed.some((f) => f.availableAt > f.acquisition[1])).toBe(true);
    expect(observed.every((f) => f.availableAt >= f.acquisition[1])).toBe(true);
    expect(observed.every((f) => f.processorPower >= 350 && f.cameraPower >= 60)).toBe(true);
    expect(state.world.ship.systems.recorder.bytesUsed).toBe(
      360 * baseline.recorder.bytesPerSample,
    );
    const saved = JSON.parse(JSON.stringify(recorder.snapshot()));
    const replay = new AttemptRecorder(header);
    replay.recordMeasurements(saved.measurements);
    expect(replay.snapshot().measurements).toEqual(recorder.snapshot().measurements);
    expect(replay.snapshot().measurements.map(decodeLatticeFrame).filter(Boolean)).toEqual(
      observed,
    );
  });

  it('reports correlated measured basis uncertainty instead of revealing true attitude from inertial aim', () => {
    const state = {
      ...initial(),
      ext: { sensorPointing: { camera: { direction: { x: 1, y: 0, z: 0 } } } },
    };
    for (const yaw of [0.25, -0.35]) {
      const env = environment();
      const product = acquire(state, {
        ...env,
        kinematics: { ...env.kinematics, attitude: fromYaw(yaw) },
      }).measurements[0]!;
      const frame = decodeLatticeFrame(product)!;
      const inferredYaw = -Math.atan2(frame.basis.forward.y, frame.basis.forward.x);
      expect(Math.abs(inferredYaw - yaw)).toBeGreaterThan(1e-8);
      expect(frame.basisSigma).toBe(0.00004);
      expect(frame.basisCorrelation).toBe('frame-common-rotation');
      expect(product.sigma.slice(12, 21).every((s) => s > 0)).toBe(true);
      expect(frame.fragments[0]!.sigma).toBe(0.0005);
      expect(
        Math.hypot(frame.basis.forward.x, frame.basis.forward.y, frame.basis.forward.z),
      ).toBeCloseTo(1, 12);
      expect(
        frame.basis.forward.x * frame.basis.right.x +
          frame.basis.forward.y * frame.basis.right.y +
          frame.basis.forward.z * frame.basis.right.z,
      ).toBeCloseTo(0, 12);
    }
  });

  it('advances raster by serialized retained support so a 16KiB cap cannot permanently starve image regions', () => {
    let state = change(initial(), 'camera', { values: { readyAt: 0, reportedCondition: 0.7 } });
    const env = environment();
    const scene = {
      ...env,
      fieldSignals: {
        ...env.fieldSignals,
        lattice: {
          kind: 'lattice-scene-v1',
          segments: Array.from({ length: 192 }, (_, i) => ({
            a: { x: 127, y: -57 + i * 0.6, z: -0.005 },
            b: { x: 127, y: -57 + i * 0.6, z: 0.005 },
          })),
        },
      },
    };
    const camera = definition.equipment.find((e) => e.id === 'camera')!;
    const range = 127 - camera.position.x + state.massProperties.centerOfMass.x;
    const originY = camera.position.y - state.massProperties.centerOfMass.y;
    const observed = new Set<number>();
    let wasTrimmed = false;
    for (let frameIndex = 0; frameIndex < 8; frameIndex++) {
      const result = acquire(state, { ...scene, t: 100 + frameIndex });
      state = result.state;
      for (const product of result.measurements) {
        const frame = decodeLatticeFrame(product)!;
        wasTrimmed ||= frame.fragments.length < 96;
        expect(new TextEncoder().encode(JSON.stringify(product)).length).toBeLessThanOrEqual(
          16 * 1024,
        );
        for (const f of frame.fragments) {
          const y = ((f.start[0] + f.end[0]) / 2) * range + originY;
          observed.add(Math.round((y + 57) / 0.6));
        }
      }
    }
    expect(wasTrimmed).toBe(true);
    expect([...observed].sort((a, b) => a - b)).toEqual(Array.from({ length: 192 }, (_, i) => i));
  });

  it('stops optional 1MB/s raw capture first without touching retained bytes or the reserve', () => {
    let s = change(initial(), 'black-box', { mode: 'high', powerDraw: 100 });
    const recorded = acquire(s, environment(), 0, 1);
    expect(recorded.state.recorder.bytesUsed - s.recorder.bytesUsed).toBe(1_000_000);
    s = {
      ...s,
      recorder: {
        ...s.recorder,
        bytesUsed: baseline.recorder.capacity - baseline.recorder.reservedEventCapacity - 1000,
      },
    };
    const full = acquire(s, environment(), 0, 1);
    expect(full.state.recorder.bytesUsed).toBe(s.recorder.bytesUsed);
    expect((full.state.ext?.latticeAcquisition as { rawStopped: boolean }).rawStopped).toBe(true);
  });

  it('fits feature transport in actual ordinary packets and needs no added recorded-byte tariff', () => {
    let s = initial();
    const start = s.recorder.bytesUsed;
    const all = [];
    for (let i = 0; i < 6; i++) {
      const r = stepSensors(s, definition, environment(100 + i * 0.1), 0.1);
      s = r.state;
      all.push(...r.measurements.filter((m) => decodeLatticeFrame(m)));
    }
    expect(all.length).toBeGreaterThan(0);
    expect(s.recorder.bytesUsed - start).toBe(6 * baseline.recorder.bytesPerSample);
  });

  it('keeps declared sigma at believed health while hidden damage changes the actual draws', () => {
    const healthy = initial();
    const damaged = change(healthy, 'camera', {
      condition: 0.25,
      values: { readyAt: 0, reportedCondition: 1 },
    });
    const a = decodeLatticeFrame(acquire(healthy).measurements[0]!)!;
    const b = decodeLatticeFrame(acquire(damaged).measurements[0]!)!;
    expect(b.fragments[0]!.sigma).toBe(a.fragments[0]!.sigma);
    expect(b.fragments[0]!.start).not.toEqual(a.fragments[0]!.start);
    const imu = change(healthy, 'imu-a', { condition: 0.25, values: { reportedCondition: 1 } });
    const sensed = stepSensors(imu, definition, environment(), 0.1);
    expect(
      sensed.measurements.find((m) => m.source === 'imu-a' && m.kind === 'accel')!.sigma,
    ).toEqual([0.0001, 0.0001, 0.0001]);
    expect(sensed.measurements.find((m) => m.channel === 'imu-a.condition')!.value).toEqual([1]);
  });
});
