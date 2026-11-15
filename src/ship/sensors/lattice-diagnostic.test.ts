import { describe, expect, it } from 'vitest';
import baseline from '../../../data/ship-baseline.json';
import { AttemptRecorder } from '../../blackbox/recorder.ts';
import { createChainLink } from '../../content/chain-link/index.ts';
import { createChainLinkEnvironment } from '../../content/chain-link/environment.ts';
import type { EnvironmentEffects, ShipSystemsState } from '../../contracts/truth/ship.ts';
import { fromYaw } from '../../lib/quat.ts';
import { createSimulation } from '../../sim/index.ts';
import { createShipSystemsState, loadShipDefinition, stepShipSystems } from '../index.ts';
import { radiationProfiles, stepCondition } from '../condition/index.ts';
import { stepThermalProtection } from '../thermal/protection.ts';
import { stepSensors } from './index.ts';
import {
  decodeLatticeDiagnostic,
  encodeLatticeDiagnostic,
  LATTICE_DIAGNOSTIC_MAX_BYTES,
} from './lattice-diagnostic-observations.ts';
import { stepLatticeDiagnostic } from './lattice-diagnostic.ts';
import { decodeLatticeFrame } from './lattice-observations.ts';
import { initializeLatticeSensorStreams } from './lattice.ts';

const definition = loadShipDefinition();
function initial(): ShipSystemsState {
  const s = initializeLatticeSensorStreams(
    createShipSystemsState(definition, 'diagnostic'),
    'diagnostic',
  );
  return {
    ...s,
    t: 100,
    recorder: { ...s.recorder, sampleRate: 0.05 },
    equipment: Object.fromEntries(
      Object.entries(s.equipment).map(([id, e]) => [
        id,
        {
          ...e,
          values: { ...e.values, readyAt: 0 },
          powerDraw:
            id === 'camera'
              ? 120
              : id === 'science-processor'
                ? 40
                : id === 'black-box'
                  ? 15
                  : id.startsWith('imu')
                    ? 15
                    : id.startsWith('star-tracker')
                      ? 20
                      : e.powerDraw,
          mode: id === 'black-box' ? 'minimum' : e.mode,
        },
      ]),
    ),
  };
}
function scene(t = 100): EnvironmentEffects {
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
      'ship-environment': { opticsValid: true },
      lattice: {
        kind: 'lattice-scene-v1',
        segments: [
          { a: { x: 127, y: -40, z: 0 }, b: { x: 127, y: 40, z: 0 } },
          { a: { x: 127, y: 0, z: -40 }, b: { x: 127, y: 0, z: 40 } },
        ],
      },
    },
  };
}
function change(
  s: ShipSystemsState,
  id: string,
  patch: Partial<ShipSystemsState['equipment'][string]>,
): ShipSystemsState {
  return { ...s, equipment: { ...s.equipment, [id]: { ...s.equipment[id]!, ...patch } } };
}
function recorder() {
  const setup = createChainLink('diagnostic-record');
  return new AttemptRecorder({
    id: 'diagnostic-record',
    index: 1,
    encounterId: 'chain-link',
    startedAt: '2026-11-14T00:00:00Z',
    start: {
      estimate: setup.definition.briefing.arrivalEstimate,
      configuration: setup.definition.briefing.arrivalConfiguration,
      modelVersion: 0,
      briefing: setup.definition.briefing,
    },
  });
}

describe('A16 first-pass raw diagnostic channel', () => {
  it('retains a <=1KiB structural image each second with idle processing and low selected science cadence', () => {
    let state = initial();
    const archive = recorder();
    for (let tick = 0; tick < 40; tick++) {
      const result = stepSensors(state, definition, scene(100 + tick * 0.1), 0.1);
      archive.recordMeasurements(result.measurements);
      state = result.state;
    }
    const tiles = archive
      .snapshot()
      .measurements.map(decodeLatticeDiagnostic)
      .filter((t) => t !== undefined);
    expect(tiles.map((t) => t.acquisition[0])).toEqual([100, 101, 102, 103]);
    expect(
      tiles.every(
        (t) => t.processorPower === 40 && t.cameraPower === 120 && t.acquisitionRate === 1,
      ),
    ).toBe(true);
    expect(tiles[0]!.pixels.some((pixel) => pixel !== null && pixel >= 10)).toBe(true);
    expect(tiles[0]!.pixels.some((pixel) => pixel !== null && pixel <= 2)).toBe(true);
    expect(tiles.every((t) => t.coverage === 'unresolved')).toBe(true);
    expect(state.recorder.sampleRate).toBe(0.05);
    expect(state.recorder.bytesUsed).toBe(4 * baseline.recorder.bytesPerSample);
    expect(archive.snapshot().measurements.some((m) => decodeLatticeFrame(m))).toBe(false);
    for (const tile of tiles) {
      const m = encodeLatticeDiagnostic(tile);
      expect(new TextEncoder().encode(JSON.stringify(m)).length).toBeLessThanOrEqual(
        LATTICE_DIAGNOSTIC_MAX_BYTES,
      );
      expect(decodeLatticeDiagnostic(m)).toEqual(tile);
      const serialized = JSON.stringify(m);
      for (const key of ['position', 'basis', 'attitude', 'segments', 'strand', 'layer', 'seed'])
        expect(serialized).not.toContain(`"${key}"`);
    }
    const replay = recorder();
    replay.recordMeasurements(JSON.parse(JSON.stringify(archive.snapshot().measurements)));
    expect(replay.snapshot().measurements).toEqual(archive.snapshot().measurements);
  });

  it('honors lower native camera cadence, physical recorder watts and original 8GB capacity', () => {
    let state = change(initial(), 'camera', { powerDraw: 60, mode: 'survey' });
    const tiles = [];
    for (let tick = 0; tick < 40; tick++) {
      const r = stepSensors(state, definition, scene(100 + tick * 0.1), 0.1);
      state = r.state;
      tiles.push(...r.measurements.map(decodeLatticeDiagnostic).filter((t) => t !== undefined));
    }
    expect(tiles.map((t) => t.acquisition[0])).toEqual([100, 102]);
    expect(tiles.every((t) => t.acquisitionRate === 0.5)).toBe(true);
    expect(state.recorder.capacity).toBe(8_000_000_000);
    const noPower = stepSensors(
      change(initial(), 'black-box', { powerDraw: 14 }),
      definition,
      scene(),
      0.1,
    );
    expect(noPower.measurements).toEqual([]);
    expect(noPower.state.recorder.bytesUsed).toBe(0);
  });

  it('never invents missing one-second frames when given a long environment tick', () => {
    const first = stepSensors(initial(), definition, scene(), 20);
    const next = stepSensors(first.state, definition, scene(120), 20);
    const tiles = [...first.measurements, ...next.measurements]
      .map(decodeLatticeDiagnostic)
      .filter((t) => t !== undefined);
    expect(tiles.map((t) => t.acquisition)).toEqual([
      [100, 100],
      [120, 120],
    ]);
    expect(tiles[1]!.sincePrevious).toBe(20);
  });

  it.each([
    ['camera', { powerDraw: 59 }],
    ['camera', { condition: 0 }],
    ['camera', { values: { readyAt: 101 } }],
    ['camera', { values: { radiationRestartUntil: 101 } }],
    ['science-processor', { powerDraw: 39 }],
    ['science-processor', { mode: 'off' }],
    ['science-processor', { values: { radiationRestartUntil: 101 } }],
    ['black-box', { values: { radiationRestartUntil: 101 } }],
  ] as const)('does not emit a diagnostic while %s is unavailable', (id, patch) => {
    const s = change(initial(), id, patch);
    const r = stepSensors(s, definition, scene(), 0.1);
    expect(r.measurements.some((m) => decodeLatticeDiagnostic(m))).toBe(false);
    expect(r.measurements.some((m) => decodeLatticeFrame(m))).toBe(false);
    expect(r.state.equipment[id]!.powerDraw).toBe(s.equipment[id]!.powerDraw);
  });

  it('resumes after a powered reboot without pretending the restart was an electrical warmup', () => {
    const s = change(initial(), 'camera', { values: { readyAt: 0, radiationRestartUntil: 101 } });
    const during = stepSensors(s, definition, scene(), 0.1);
    expect(during.measurements.some((m) => m.kind === 'bearing')).toBe(false);
    expect(during.state.equipment.camera!.values.readyAt).toBe(0);
    expect(during.measurements.some((m) => m.channel === 'service.temperature')).toBe(true);
    const resumed = stepSensors(during.state, definition, scene(101), 0.1);
    expect(resumed.measurements.some((m) => decodeLatticeDiagnostic(m))).toBe(true);
  });

  it.each(['camera', 'science-processor', 'black-box'] as const)(
    'honors an actual 3A %s upset and recovery without erasing retained images',
    (id) => {
      const first = stepSensors(initial(), definition, scene(), 0.1);
      const archive = recorder();
      archive.recordMeasurements(first.measurements);
      const profile = radiationProfiles(definition).get(id)!;
      // End at the first weighted upset bucket, below the raw burnout threshold
      // throughout this four-second fixture. 3A applies susceptibility exactly once.
      const upset = stepCondition(
        first.state,
        definition,
        { [id]: { rawDose: profile.upsetInterval / profile.susceptibility, aboveBurnout: false } },
        { [id]: true },
        4,
      );
      expect(upset.events).toContainEqual({
        kind: 'equipment-fault',
        t: 104,
        equipment: id,
        fault: 'radiation-upset',
      });
      expect(upset.state.equipment[id]!.powerDraw).toBe(first.state.equipment[id]!.powerDraw);
      const restartAt = upset.state.equipment[id]!.values.radiationRestartUntil!;
      const during = stepSensors({ ...upset.state, t: 104 }, definition, scene(104), 0.1);
      expect(during.measurements.some((m) => decodeLatticeDiagnostic(m))).toBe(false);
      expect(during.state.equipment.camera!.values.readyAt).toBe(0);
      const beforeRecovery = stepSensors(during.state, definition, scene(restartAt - 0.001), 0.001);
      expect(beforeRecovery.measurements.some((m) => decodeLatticeDiagnostic(m))).toBe(false);
      const recovered = stepCondition(
        during.state,
        definition,
        {},
        { [id]: true },
        restartAt - during.state.t,
      );
      expect(recovered.events).toContainEqual({
        kind: 'equipment-recovered',
        t: restartAt,
        equipment: id,
      });
      const resumed = stepSensors(
        { ...recovered.state, t: restartAt },
        definition,
        scene(restartAt),
        0.1,
      );
      archive.recordMeasurements(resumed.measurements);
      expect(
        archive
          .snapshot()
          .measurements.map(decodeLatticeDiagnostic)
          .filter((tile) => tile !== undefined)
          .map((tile) => tile.acquisition),
      ).toEqual([
        [100, 100],
        [restartAt, restartAt],
      ]);
      expect(resumed.state.exposure[id]).toBe(profile.upsetInterval);
    },
  );

  it('keeps a thermally inhibited camera unavailable until 3A clears the inhibition', () => {
    const start = initial();
    const min = definition.equipment.find((e) => e.id === 'camera')!.params.tempMin!;
    const cold = stepThermalProtection(
      { ...start, thermal: { ...start.thermal, service: min - 1 } },
      definition,
      0.1,
    ).state;
    expect(cold.equipment.camera!.values.thermalInhibited).toBe(1);
    // Even a now-warm temperature reading cannot bypass the condition owner's flag.
    const warming = { ...cold, thermal: start.thermal };
    expect(
      stepSensors(warming, definition, scene(), 0.1).measurements.some((m) =>
        decodeLatticeDiagnostic(m),
      ),
    ).toBe(false);
    const recovered = stepThermalProtection(warming, definition, 0.1).state;
    expect(recovered.equipment.camera!.values.thermalInhibited).toBe(0);
    expect(
      stepSensors(recovered, definition, scene(), 0.1).measurements.some((m) =>
        decodeLatticeDiagnostic(m),
      ),
    ).toBe(true);
  });

  it.each(['camera', 'imu-a', 'star-tracker-a'] as const)(
    'suppresses fresh %s instrument output during powered reboot while retaining housekeeping',
    (id) => {
      const s = change(initial(), id, { values: { readyAt: 0, radiationRestartUntil: 101 } });
      const r = stepSensors(s, definition, scene(), 0.1);
      expect(r.measurements.filter((m) => m.source === id && m.kind !== 'telemetry')).toEqual([]);
      expect(r.measurements.find((m) => m.channel === `${id}.power`)!.value).toEqual([
        s.equipment[id]!.powerDraw,
      ]);
      expect(r.measurements.some((m) => m.channel === 'service.temperature')).toBe(true);
    },
  );

  it('marks opaque and out-of-cone pixels unknown and respects optical/thermal validity', () => {
    const env = scene();
    const blocked = {
      ...env,
      targets: [
        {
          id: 'opaque-rock',
          kind: 'asteroid' as const,
          relativePosition: { x: 60, y: 0, z: 0 },
          relativeVelocity: { x: 0, y: 0, z: 0 },
          radius: 40,
        },
      ],
    };
    const r = stepLatticeDiagnostic(initial(), definition, blocked, 1024);
    const tile = decodeLatticeDiagnostic(r.measurements[0]!)!;
    expect(tile.pixels.every((p) => p === null)).toBe(true);
    expect(tile.coverage).toBe('unresolved');
    const dark = {
      ...env,
      fieldSignals: { ...env.fieldSignals, 'ship-environment': { opticsValid: false } },
    };
    expect(stepLatticeDiagnostic(initial(), definition, dark, 1024).measurements).toEqual([]);
    expect(
      stepLatticeDiagnostic(
        { ...initial(), thermal: { ...initial().thermal, service: 313 } },
        definition,
        env,
        1024,
      ).measurements,
    ).toEqual([]);
  });

  it('does not retain a raw tile beyond supplied packet bytes or optional storage headroom', () => {
    const s = initial();
    const tooSmall = stepLatticeDiagnostic(s, definition, scene(), 1);
    expect(tooSmall.measurements).toEqual([]);
    expect(tooSmall.bytes).toBe(0);
    const full = {
      ...s,
      recorder: {
        ...s.recorder,
        bytesUsed: s.recorder.capacity - baseline.recorder.reservedEventCapacity,
      },
    };
    const r = stepSensors(full, definition, scene(), 0.1);
    expect(r.measurements).toEqual([]);
    expect(r.state.recorder.bytesUsed).toBe(full.recorder.bytesUsed);
  });

  it('rejects malformed archive sigmas and oversized imported diagnostic records', () => {
    const m = stepLatticeDiagnostic(initial(), definition, scene(), 1024).measurements[0]!;
    expect(decodeLatticeDiagnostic(m)).toBeDefined();
    expect(decodeLatticeDiagnostic({ ...m, sigma: [] })).toBeUndefined();
    expect(decodeLatticeDiagnostic({ ...m, sigma: m.sigma.map(() => 0) })).toBeUndefined();
    expect(
      decodeLatticeDiagnostic({ ...m, sigma: m.sigma.map((s, i) => (i === 20 ? NaN : s)) }),
    ).toBeUndefined();
    expect(
      decodeLatticeDiagnostic({ ...m, field: 'unbounded-import'.repeat(100) }),
    ).toBeUndefined();
  });

  it('keeps recorded images after camera loss, with no fresh tile or fabricated current instrument values', () => {
    let state = initial();
    const archive = recorder();
    for (let tick = 0; tick < 40; tick++) {
      if (tick === 20) state = change(state, 'camera', { condition: 0 });
      const r = stepSensors(state, definition, scene(100 + tick * 0.1), 0.1);
      state = r.state;
      archive.recordMeasurements(r.measurements);
    }
    const recorded = archive
      .snapshot()
      .measurements.map(decodeLatticeDiagnostic)
      .filter((t) => t !== undefined);
    expect(recorded.map((t) => t.acquisition[1])).toEqual([100, 101]);
    expect(recorded[1]!.availableAt).toBe(101);
  });

  it('records the authored scene through real ship power and recorder after cold optics warm up, without enabling reconstruction', () => {
    const setup = createChainLink('diagnostic-production', { catalogueIndex: 0 });
    const sim = createSimulation(setup.definition.world, {
      dt: setup.definition.dt,
      registry: setup.fieldRegistry,
    });
    const environment = createChainLinkEnvironment(setup);
    let state = sim.initial;
    const archive = recorder();
    for (let tick = 0; tick < 360; tick++) {
      const r = stepShipSystems(
        state.world.ship.systems,
        setup.definition.ship,
        tick === 0 ? [{ kind: 'recorder', sampleRate: 0.05 }] : [],
        environment.at(state),
        sim.dt,
      );
      archive.recordMeasurements(r.measurements);
      state = sim.step(state, { systems: r.state, actuators: r.actuators }).state;
    }
    const tiles = archive
      .snapshot()
      .measurements.map(decodeLatticeDiagnostic)
      .filter((t) => t !== undefined);
    expect(tiles.map((t) => t.acquisition[0])).toEqual([30, 31, 32, 33, 34, 35]);
    expect(tiles.some((t) => t.pixels.some((pixel) => pixel !== null && pixel >= 10))).toBe(true);
    expect(state.world.ship.systems.equipment['science-processor']!.mode).toBe('idle');
    expect(archive.snapshot().measurements.some((m) => decodeLatticeFrame(m))).toBe(false);
  });
});
