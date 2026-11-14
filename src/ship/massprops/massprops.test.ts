import { describe, expect, it } from 'vitest';
import { loadShipDefinition } from '../definition.ts';
import { createShipSystemsState } from '../state.ts';
import { computeMassProperties } from './massprops.ts';

describe('baseline mass properties (C02, C13)', () => {
  const definition = loadShipDefinition();
  it('matches the independent 1C wet and drained sums', () => {
    const initial = createShipSystemsState(definition);
    expect(initial.massProperties.mass).toBe(30374);
    expect(initial.massProperties.centerOfMass.x).toBeCloseTo(-0.33285, 6);
    expect(initial.massProperties.inertia.moments.z).toBeCloseTo(325048.751, 3);
    const empty = computeMassProperties(
      { ...initial, tanks: { ...initial.tanks, 'main-propellant': 0 } },
      definition,
    );
    expect(empty.mass).toBe(24374);
    expect(empty.centerOfMass.x).toBeCloseTo(0.077542, 6);
    expect(empty.centerOfMass.x).toBeGreaterThan(initial.massProperties.centerOfMass.x);
  });
  it('keeps converted reactants aboard and moves their center forward', () => {
    const initial = createShipSystemsState(definition);
    const converted = computeMassProperties(
      {
        ...initial,
        tanks: {
          ...initial.tanks,
          'fuel-cell-hydrogen': 0,
          'fuel-cell-oxygen': 0,
          'product-water': 54,
        },
      },
      definition,
    );
    expect(converted.mass).toBe(initial.massProperties.mass);
    expect(converted.centerOfMass.x - initial.massProperties.centerOfMass.x).toBeCloseTo(
      54 / 30374,
      12,
    );
  });
  it('moves the center sideways when only the left RCS reservoir drains', () => {
    const initial = createShipSystemsState(definition);
    const drained = computeMassProperties(
      { ...initial, tanks: { ...initial.tanks, 'rcs-left': 0 } },
      definition,
    );
    expect(drained.centerOfMass.y).toBeLessThan(initial.massProperties.centerOfMass.y);
    expect(drained.mass).toBe(30224);
  });
});
