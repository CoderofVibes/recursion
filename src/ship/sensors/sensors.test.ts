import { describe, expect, it } from 'vitest';
import baseline from '../../../data/ship-baseline.json';
import type {
  EquipmentState,
  EnvironmentEffects,
  ShipSystemsState,
} from '../../contracts/truth/ship.ts';
import { createRng } from '../../lib/rng.ts';
import { loadShipDefinition } from '../definition.ts';
import {
  opticalQuality,
  requestedRecorderPower,
  sensorStreamNames,
  stepSensors,
  supportedRecorderRate,
} from './index.ts';

const definition = loadShipDefinition();
function initial(): ShipSystemsState {
  const equipment = Object.fromEntries(
    definition.equipment.map((spec): [string, EquipmentState] => [
      spec.id,
      {
        id: spec.id,
        mode: spec.defaultMode,
        allocation: spec.ratedPower,
        powerDraw: spec.id === 'camera' ? 120 : spec.id === 'black-box' ? 35 : spec.ratedPower,
        condition: 1,
        tripped: false,
        temperature: 293,
        faults: [],
        values: { readyAt: 0 },
      },
    ]),
  );
  return {
    t: 100,
    configuration: definition.defaultConfiguration,
    equipment,
    tanks: { main: 6000 },
    thermal: { cabin: 293, service: 293 },
    recorder: { sampleRate: 10, bytesUsed: 0, capacity: baseline.recorder.capacity },
    exposure: {},
    attitudeTarget: { reference: 'free' },
    burns: [],
    massProperties: { mass: 30374, centerOfMass: { x: 0, y: 0 }, inertia: 1, footprint: [] },
    rng: Object.fromEntries(
      sensorStreamNames(definition).map((name) => [
        name,
        createRng('sensor-tests').stream(name).getState(),
      ]),
    ),
  };
}
const environment = (t = 100): EnvironmentEffects => ({
  t,
  kinematics: {
    position: { x: 10000, y: 10000 },
    velocity: { x: 30, y: 40 },
    attitude: 0,
    angularRate: 0,
  },
  specificForce: { x: 0, y: 0 },
  targets: [
    {
      id: 'known-body',
      kind: 'body',
      relativePosition: { x: 10000, y: 0 },
      relativeVelocity: { x: 0, y: 0 },
      radius: 50,
    },
  ],
  intensity: {},
  fieldSignals: {},
  sunlight: { direction: { x: 1, y: 0 }, irradiance: 0 },
});
function changeEquipment(
  state: ShipSystemsState,
  id: string,
  patch: Partial<EquipmentState>,
): ShipSystemsState {
  return {
    ...state,
    equipment: { ...state.equipment, [id]: { ...state.equipment[id]!, ...patch } },
  };
}
const instrument = (result: ReturnType<typeof stepSensors>, kind: string) =>
  result.measurements.filter((m) => m.kind === kind);

describe('sensor quality and semantics (C01, C05, C12, C14)', () => {
  it('uses bounded electrical quality and range-dependent transverse uncertainty', () => {
    const low = opticalQuality(60, 10000, 1, 0.05)!;
    const high = opticalQuality(200, 10000, 1, 0.05)!;
    expect(high.angularSigma).toBeLessThan(low.angularSigma);
    expect(opticalQuality(10000, 10000, 1, 0.05)).toEqual(high);
    expect(opticalQuality(200, 20000, 1, 0.05)!.transverseSigma).toBe(2 * high.transverseSigma);
    expect(opticalQuality(200, 10000, 0.5, 0.05)!.angularSigma).toBe(2 * high.angularSigma);
    expect(opticalQuality(59, 10000, 1, 0.05)).toBeUndefined();
    expect(opticalQuality(200, 10000, 0, 0.05)).toBeUndefined();
    expect(opticalQuality(200, 10000, 1, 1)!.exposure).toBe(0.5);
  });

  it('never infers range or absolute position from an unknown target radius', () => {
    const result = stepSensors(initial(), definition, environment(), 0.02);
    expect(instrument(result, 'bearing')).toHaveLength(1);
    expect(instrument(result, 'range')).toHaveLength(0);
    expect(instrument(result, 'relative-position')).toHaveLength(0);
    const env = {
      ...environment(),
      fieldSignals: { 'ship-environment': { knownSizeTargets: ['known-body'] } },
    };
    expect(instrument(stepSensors(initial(), definition, env, 0.02), 'range')[0]!.sigma).toEqual([
      500,
    ]);
  });

  it('respects power, condition, boresight, settling, darkness, missing target and smear', () => {
    const state = initial();
    const env = environment();
    expect(
      instrument(
        stepSensors(changeEquipment(state, 'camera', { powerDraw: 59 }), definition, env, 0.02),
        'bearing',
      ),
    ).toHaveLength(0);
    expect(
      instrument(
        stepSensors(changeEquipment(state, 'camera', { condition: 0 }), definition, env, 0.02),
        'bearing',
      ),
    ).toHaveLength(0);
    expect(
      instrument(
        stepSensors(
          state,
          definition,
          { ...env, kinematics: { ...env.kinematics, attitude: Math.PI } },
          0.02,
        ),
        'bearing',
      ),
    ).toHaveLength(0);
    const pending = {
      ...state,
      ext: { sensorPointing: { camera: { target: 'known-body', settleUntil: 105 } } },
    };
    expect(instrument(stepSensors(pending, definition, env, 0.02), 'bearing')).toHaveLength(0);
    const dark = { ...env, fieldSignals: { 'ship-environment': { opticsValid: false } } };
    expect(instrument(stepSensors(state, definition, dark, 0.02), 'bearing')).toHaveLength(0);
    expect(
      instrument(stepSensors(state, definition, { ...env, targets: [] }, 0.02), 'bearing'),
    ).toHaveLength(0);
    expect(
      instrument(
        stepSensors(
          state,
          definition,
          { ...env, kinematics: { ...env.kinematics, angularRate: 0.1 } },
          0.02,
        ),
        'bearing',
      ),
    ).toHaveLength(0);
  });

  it('does not observe occluded objects even when explicitly pointed at them', () => {
    const state = {
      ...initial(),
      ext: { sensorPointing: { camera: { target: 'known-body', settleUntil: 0 } } },
    };
    const env = {
      ...environment(),
      fieldSignals: { 'ship-environment': { visibility: { 'known-body': false } } },
    };
    expect(instrument(stepSensors(state, definition, env, 0.02), 'bearing')).toHaveLength(0);
  });

  it('rejects smear from a fast transverse target even with stationary body yaw', () => {
    const env = environment();
    const fast = {
      ...env,
      targets: env.targets.map((target) => ({ ...target, relativeVelocity: { x: 0, y: 1000 } })),
    };
    expect(instrument(stepSensors(initial(), definition, fast, 0.02), 'bearing')).toHaveLength(0);
  });

  it('observes only supplied COM specific force; orbit truth cannot change an accelerometer', () => {
    const env = environment();
    const coast = stepSensors(initial(), definition, env, 0.02);
    const differentOrbit = stepSensors(
      initial(),
      definition,
      {
        ...env,
        targets: [],
        kinematics: {
          ...env.kinematics,
          position: { x: 1e8, y: 0 },
          velocity: { x: 10000, y: 10000 },
        },
      },
      0.02,
    );
    expect(instrument(coast, 'accel')).toEqual(instrument(differentOrbit, 'accel'));
    const powered = stepSensors(
      initial(),
      definition,
      { ...env, specificForce: { x: 2, y: -3 } },
      0.02,
    );
    const base = instrument(coast, 'accel')[0]!;
    const changed = instrument(powered, 'accel')[0]!;
    expect(changed.value[0]! - base.value[0]!).toBeCloseTo(2, 12);
    expect(changed.value[1]! - base.value[1]!).toBeCloseTo(-3, 12);
  });

  it('loses star attitude when there is no sky or rate is excessive', () => {
    const env = environment();
    expect(instrument(stepSensors(initial(), definition, env, 0.02), 'attitude')).toHaveLength(2);
    expect(
      instrument(
        stepSensors(
          initial(),
          definition,
          { ...env, fieldSignals: { 'ship-environment': { starsVisible: false } } },
          0.02,
        ),
        'attitude',
      ),
    ).toHaveLength(0);
    expect(
      instrument(
        stepSensors(
          initial(),
          definition,
          { ...env, kinematics: { ...env.kinematics, angularRate: 0.02 } },
          0.02,
        ),
        'attitude',
      ),
    ).toHaveLength(0);
  });

  it('requires camera warmup again after actual power loss', () => {
    const off = stepSensors(
      changeEquipment(initial(), 'camera', { powerDraw: 0 }),
      definition,
      environment(),
      1,
    );
    const restored = changeEquipment(off.state, 'camera', { powerDraw: 120 });
    expect(
      instrument(stepSensors(restored, definition, environment(101), 1), 'bearing'),
    ).toHaveLength(0);
    expect(
      instrument(stepSensors(restored, definition, environment(131), 1), 'bearing'),
    ).toHaveLength(1);
  });
});

describe('recording and replay (C06/P2/P8/P12)', () => {
  it('matches 1C recorder electrical endpoints and inverts intermediate allocations', () => {
    for (const [rate, power] of [
      [1, 15],
      [10, 35],
      [50, 100],
    ]) {
      expect(requestedRecorderPower(rate!)).toBe(power);
      expect(supportedRecorderRate(power!)).toBe(rate);
    }
    expect(requestedRecorderPower(0)).toBe(0);
    expect(supportedRecorderRate(14)).toBe(0);
    expect(supportedRecorderRate(requestedRecorderPower(25))).toBeCloseTo(25);
    expect(requestedRecorderPower(500)).toBe(100);
  });

  it('records only actual timestamped snapshots at cadence; a large step does not fabricate samples', () => {
    const first = stepSensors(initial(), definition, environment(), 0.02);
    expect(first.state.recorder.bytesUsed).toBe(baseline.recorder.bytesPerSample);
    const notDue = stepSensors(first.state, definition, environment(100.02), 0.02);
    expect(notDue.measurements).toHaveLength(0);
    const next = stepSensors(notDue.state, definition, environment(100.1), 0.02);
    expect(next.measurements.length).toBeGreaterThan(0);
    expect(next.measurements.every((m) => m.t === 100.1)).toBe(true);
    expect(instrument(next, 'bearing')).toHaveLength(0);
    const long = stepSensors(initial(), definition, environment(), 60);
    expect(long.state.recorder.bytesUsed).toBe(baseline.recorder.bytesPerSample);
    expect(long.measurements.every((m) => m.t === 100)).toBe(true);
  });

  it('leaves retained bytes and seeded noise unchanged while full or unpowered', () => {
    const full: ShipSystemsState = {
      ...initial(),
      recorder: {
        ...initial().recorder,
        bytesUsed: baseline.recorder.capacity - baseline.recorder.reservedEventCapacity,
      },
    };
    const result = stepSensors(full, definition, environment(), 1);
    expect(result.measurements).toEqual([]);
    expect(result.state.recorder.bytesUsed).toBe(full.recorder.bytesUsed);
    expect(result.state.rng).toEqual(full.rng);
    expect(result.events).toHaveLength(1);
    expect(stepSensors(result.state, definition, environment(101), 1).events).toHaveLength(0);
    const unpowered = changeEquipment(initial(), 'black-box', { powerDraw: 0 });
    const gap = stepSensors(unpowered, definition, environment(), 1);
    expect(gap.measurements).toHaveLength(0);
    expect(gap.state.rng).toEqual(unpowered.rng);
  });

  it('is pure and bit-for-bit repeatable after JSON save/restore', () => {
    const state = initial();
    const serialized = JSON.stringify(state);
    const first = stepSensors(state, definition, environment(), 0.02);
    expect(JSON.stringify(state)).toBe(serialized);
    expect(first).toEqual(stepSensors(state, definition, environment(), 0.02));
    expect(first.state.rng).not.toEqual(state.rng);
    const saved = JSON.parse(JSON.stringify(first.state)) as ShipSystemsState;
    expect(stepSensors(saved, definition, environment(101), 0.02)).toEqual(
      stepSensors(first.state, definition, environment(101), 0.02),
    );
    for (const measurement of first.measurements)
      expect(measurement.sigma).toHaveLength(measurement.value.length);
  });

  it('uses real equipment sources for tank, thermal and power-bus telemetry channels', () => {
    const state = { ...initial(), ext: { power: { buses: { 'main-a': { load: 1234 } } } } };
    const result = stepSensors(state, definition, environment(), 0.02);
    const ids = new Set(definition.equipment.map((spec) => spec.id));
    expect(result.measurements.every((m) => ids.has(m.source))).toBe(true);
    expect(result.measurements.find((m) => m.channel === 'main-a.load')?.value).toEqual([1234]);
    expect(result.measurements.find((m) => m.channel === 'main.propellant')?.source).toBe(
      'black-box',
    );
    expect(result.measurements.find((m) => m.channel === 'cabin.temperature')?.source).toBe(
      'black-box',
    );
  });
});
