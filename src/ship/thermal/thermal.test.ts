import { describe, expect, it } from 'vitest';
import { mockEnvironmentEffects } from '../../contracts/fixtures/truth.ts';
import { loadShipDefinition } from '../definition.ts';
import { createShipSystemsState } from '../state.ts';
import { stepPower } from '../power/index.ts';
import { stepThermal } from './index.ts';

const definition = loadShipDefinition();
const env = mockEnvironmentEffects;
const power = () => stepPower(createShipSystemsState(), definition, env, 1).state;

describe('thermal: baseline C04/C11 stub', () => {
  it('conserves heat through transfers and radiation', () => {
    const before = power();
    const result = stepThermal(before, definition, env, 30);
    const q = result.state.ext!.thermal as unknown as Record<string, number>;
    expect(Math.abs(q.energyResidual!)).toBeLessThan(1e-4);
    expect(q.heatInput).toBeGreaterThan(400);
    expect(q.radiated).toBeGreaterThan(0);
    expect(Object.values(result.state.thermal).every(Number.isFinite)).toBe(true);
    expect(result.state.equipment.camera!.temperature).toBe(result.state.thermal.service);
  });

  it('uses the same fractional deployment for radiator area', () => {
    const before = power();
    const withFraction = (fraction: number) => ({
      ...before,
      equipment: {
        ...before.equipment,
        'radiator-left': {
          ...before.equipment['radiator-left']!,
          values: { ...before.equipment['radiator-left']!.values, deployment: fraction },
        },
      },
    });
    const stowed = stepThermal(withFraction(0), definition, env, 1).state;
    const half = stepThermal(withFraction(0.5), definition, env, 1).state;
    const deployed = stepThermal(withFraction(1), definition, env, 1).state;
    expect(stowed.equipment['radiator-left']!.values.emittingArea).toBe(5);
    expect(half.equipment['radiator-left']!.values.emittingArea).toBe(27.5);
    expect(deployed.equipment['radiator-left']!.values.emittingArea).toBe(50);
  });

  it('loses active thermal transport when the cooling pump is unavailable', () => {
    const initial = power();
    const before = { ...initial, thermal: { ...initial.thermal, service: 310 } };
    const active = stepThermal(before, definition, env, 10).state;
    const stopped = stepThermal(
      {
        ...before,
        equipment: {
          ...before.equipment,
          'external-pump-a': { ...before.equipment['external-pump-a']!, powerDraw: 0 },
        },
      },
      definition,
      env,
      10,
    ).state;
    expect(stopped.thermal.service).toBeGreaterThan(active.thermal.service!);
  });

  it('retains hot state and is deterministic without mutation', () => {
    const before = power();
    const copy = structuredClone(before);
    const first = stepThermal(before, definition, env, 10);
    expect(first).toEqual(stepThermal(before, definition, env, 10));
    expect(before).toEqual(copy);
    const hot = { ...before, thermal: { ...before.thermal, cabin: 310 } };
    expect(stepThermal(hot, definition, env, 1).state.thermal.cabin).toBeGreaterThan(309);
  });
});
