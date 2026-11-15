/**
 * Hidden calibration reaches ship systems only as initial equipment values.
 */

import { describe, expect, it } from 'vitest';
import { hashState } from '../lib/hash.ts';
import { loadShipDefinition } from '../ship/index.ts';
import { createArrivalSystems, hiddenEquipmentValues } from './arrival.ts';

const definition = loadShipDefinition();

describe('hidden calibration mapping', () => {
  it('maps thruster and sensor parameters to the values ship systems read', () => {
    expect(
      hiddenEquipmentValues(definition, {
        'thruster.main-engine.scale': 0.97,
        'thruster.main-engine.misalignment': 0.004,
        'sensor.imu-a.bias-x': 1e-5,
        'sensor.imu-a.bias-y': -2e-5,
        'sensor.imu-b.bias': 3e-6,
        'body.alpha.mu': 1e10,
        'law.gravity.exponent': 2.5,
      }),
    ).toEqual({
      'main-engine': { thrustScale: 0.97, misalignment: 0.004 },
      'imu-a': { biasX: 1e-5, biasY: -2e-5 },
      'imu-b': { gyroBias: 3e-6 },
    });
  });

  it('maps the values the 3D ship reads: pitch mount error, z bias, gyro x and y', () => {
    expect(
      hiddenEquipmentValues(definition, {
        'thruster.main-engine.misalignment-pitch': -0.002,
        'sensor.imu-a.bias-z': 3e-5,
        'sensor.imu-a.rate-bias-x': 1e-6,
        'sensor.imu-a.rate-bias-y': -2e-6,
      }),
    ).toEqual({
      'main-engine': { misalignmentPitch: -0.002 },
      'imu-a': { biasZ: 3e-5, gyroBiasX: 1e-6, gyroBiasY: -2e-6 },
    });
  });

  it('sets the shared RCS scale on every pod, a pod of its own overriding it', () => {
    const pods = definition.equipment.filter((e) => e.kind === 'rcs-thruster').map((e) => e.id);
    expect(pods).toHaveLength(4);
    const values = hiddenEquipmentValues(definition, {
      'thruster.rcs-aft-left.scale': 0.9,
      'thruster.rcs.scale': 0.95,
    });
    expect(Object.keys(values).sort()).toEqual([...pods].sort());
    for (const pod of pods)
      expect(values[pod]).toEqual({ thrustScale: pod === 'rcs-aft-left' ? 0.9 : 0.95 });
    // `rcs` is a group: it has a scale and nothing else.
    expect(() =>
      hiddenEquipmentValues(definition, { 'thruster.rcs.misalignment': 0.01 }),
    ).toThrow();
  });

  it('reaches the ship: the arrival state carries the 3D values the ship step reads', () => {
    const state = createArrivalSystems(
      definition,
      { 'thruster.main-engine.misalignment-pitch': 0.004, 'sensor.imu-b.rate-bias-y': 5e-6 },
      'seed',
    );
    expect(state.equipment['main-engine']!.values.misalignmentPitch).toBe(0.004);
    expect(state.equipment['imu-b']!.values.gyroBiasY).toBe(5e-6);
  });

  it('refuses hardware it does not know', () => {
    expect(() => hiddenEquipmentValues(definition, { 'thruster.warp-drive.scale': 2 })).toThrow();
    expect(() => hiddenEquipmentValues(definition, { 'thruster.main-engine.colour': 2 })).toThrow();
  });
});

describe('arrival ship state', () => {
  const hidden = { 'thruster.main-engine.scale': 0.9, 'sensor.imu-a.bias-x': 4e-5 };

  it('applies the calibration on top of the 1C arrival state', () => {
    const state = createArrivalSystems(definition, hidden, 'seed');
    expect(state.t).toBe(0);
    expect(state.equipment['main-engine']!.values.thrustScale).toBe(0.9);
    expect(state.equipment['imu-a']!.values.biasX).toBe(4e-5);
    expect(state.tanks['main-propellant']).toBe(6000);
    expect(state.massProperties.mass).toBeCloseTo(30374, 0);
  });

  it('is a pure function of the definition, calibration and seed', () => {
    const a = createArrivalSystems(definition, hidden, 'seed');
    expect(hashState(createArrivalSystems(definition, hidden, 'seed'))).toBe(hashState(a));
    expect(hashState(createArrivalSystems(definition, hidden, 'other'))).not.toBe(hashState(a));
  });
});
