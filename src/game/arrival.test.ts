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
