import { expect, it } from 'vitest';
import { loadShipDefinition } from '../definition.ts';
import { createShipSystemsState } from '../state.ts';
import { environment } from '../test-helpers.ts';
import { getGeometry, stepConfiguration } from './configuration.ts';
import { computeMassProperties } from '../massprops/index.ts';
import { stepPower } from '../power/index.ts';
import { stepThermal } from '../thermal/index.ts';

it('keeps a jammed half radiator at the same physical geometry for mass, clearance and cooling', () => {
  const definition = loadShipDefinition();
  const initial = createShipSystemsState(definition);
  const left = initial.equipment['radiator-left']!;
  const state = {
    ...initial,
    transition: { to: 'allDeployed', completesAt: 10 },
    equipment: {
      ...initial.equipment,
      'radiator-left': {
        ...left,
        mode: 'moving',
        powerDraw: 80,
        faults: ['deployment-jam'],
        values: { ...left.values, deployment: 0.5 },
      },
    },
  };
  const before = getGeometry(state, definition);
  const moved = stepConfiguration(state, definition, 10).state;
  const after = getGeometry(moved, definition);
  expect(after.deployment['radiator-left']).toBe(0.5);
  expect(after.positions['radiator-left']).toEqual(before.positions['radiator-left']);
  expect(computeMassProperties(moved, definition)).toEqual(
    computeMassProperties(state, definition),
  );
  const env = environment(moved);
  const powered = stepPower(moved, definition, env, 1).state;
  const thermal = stepThermal(powered, definition, env, 1).state;
  expect(thermal.equipment['radiator-left']!.values.emittingArea).toBe(27.5);
  expect(thermal.equipment['radiator-right']!.values.emittingArea).toBe(50);
  expect(moved.transition).toBeDefined();
});
