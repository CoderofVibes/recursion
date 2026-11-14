import { describe, expect, it } from 'vitest';
import { loadShipDefinition } from '../definition.ts';
import { createShipSystemsState } from '../state.ts';
import { computeMassProperties } from '../massprops/massprops.ts';
import { getGeometry, prepareConfiguration, stepConfiguration } from './configuration.ts';

describe('configuration geometry (C04)', () => {
  const definition = loadShipDefinition();
  it('requires motor power and freezes the occupied geometry on loss of power', () => {
    const initial = createShipSystemsState(definition);
    const commanded = prepareConfiguration(
      { ...initial, transition: { to: 'stowed', completesAt: 20 } },
      definition,
    );
    const stalled = stepConfiguration(commanded, definition, 10).state;
    expect(getGeometry(stalled, definition)).toEqual(getGeometry(initial, definition));
    expect(stalled.transition).toBeDefined();
    expect(commanded.equipment['radiator-left']!.mode).toBe('moving');
  });
  it('uses the same intermediate extension for position, inertia and footprint', () => {
    const initial = createShipSystemsState(definition);
    const left = initial.equipment['radiator-left']!;
    const state = {
      ...initial,
      transition: { to: 'stowed', completesAt: 20 },
      equipment: {
        ...initial.equipment,
        'radiator-left': { ...left, mode: 'moving', powerDraw: 80 },
      },
    };
    const halfway = stepConfiguration(state, definition, 10).state;
    const geometry = getGeometry(halfway, definition);
    expect(geometry.deployment['radiator-left']).toBe(0.5);
    expect(geometry.deployment['radiator-right']).toBe(1);
    expect(geometry.positions['radiator-left']!.y).toBe(4);
    expect(geometry.intrinsicInertia['radiator-left']).toBe(1500);
    expect(Math.max(...geometry.hull[0]!.outline.map((p) => p.y))).toBe(6.25);
    expect(Math.min(...geometry.hull[0]!.outline.map((p) => p.y))).toBe(-10);
    expect(computeMassProperties(halfway, definition).centerOfMass.y).toBeLessThan(
      initial.massProperties.centerOfMass.y,
    );
  });
  it('completes only when all moving appendages reach their targets', () => {
    const initial = createShipSystemsState(definition);
    const equipment = { ...initial.equipment };
    for (const id of ['radiator-left', 'radiator-right'])
      equipment[id] = { ...equipment[id]!, mode: 'moving', powerDraw: 80 };
    const result = stepConfiguration(
      { ...initial, equipment, transition: { to: 'stowed', completesAt: 20 } },
      definition,
      20,
    );
    expect(result.state.transition).toBeUndefined();
    expect(result.state.configuration).toBe('stowed');
    expect(result.events).toEqual([
      { kind: 'configuration-changed', t: 20, configuration: 'stowed' },
    ]);
    expect(getGeometry(result.state, definition).hull).toEqual(
      definition.configurations.find((c) => c.id === 'stowed')!.hull,
    );
  });
});
