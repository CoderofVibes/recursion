import { expect, it } from 'vitest';
import { loadShipDefinition, createShipSystemsState, stepShipSystems } from '../index.ts';
import { environment, rcsPropellant } from '../test-helpers.ts';
import { electricalService } from '../power/service.ts';

it(
  'sustains 72 h of illuminated free coast on real arrays without fuel, propellant or resource exemptions',
  { timeout: 60000 },
  () => {
    const definition = loadShipDefinition();
    let state = createShipSystemsState(definition, '3a-transit');
    state = {
      ...state,
      configuration: 'allDeployed',
      equipment: Object.fromEntries(
        Object.entries(state.equipment).map(([id, e]) => [
          id,
          {
            ...e,
            mode:
              id.startsWith('fuel-cell') || ['camera', 'science-processor', 'comms'].includes(id)
                ? 'off'
                : id.startsWith('solar-')
                  ? 'deployed'
                  : e.mode,
            values:
              id.startsWith('solar-') || id.startsWith('radiator-')
                ? { ...e.values, deployment: 1 }
                : e.values,
          },
        ]),
      ),
    };
    const before = structuredClone(state);
    let at48 = state.thermal;
    let maximumResidual = 0;
    for (let t = 0; t < 72 * 3600; t += 10) {
      const env = environment(state, undefined, {
        sunlight: { direction: { x: 1, y: 0, z: 0 }, irradiance: 600 },
      });
      const result = stepShipSystems(state, definition, [], env, 10);
      state = result.state;
      if (state.t === 48 * 3600) at48 = state.thermal;
      expect(electricalService(state, definition).criticalElectricalService).toBe(true);
      const p = state.ext!.power as Record<string, number>;
      expect(p.unmet).toBeLessThan(1e-8);
      expect(p.generated! + p.discharged! - p.load! - p.charged! - p.conversionLoss!).toBeCloseTo(
        0,
        7,
      );
      maximumResidual = Math.max(
        maximumResidual,
        Math.abs((state.ext!.thermal as Record<string, number>).energyResidual!),
      );
    }
    expect(state.tanks).toEqual(before.tanks);
    expect(rcsPropellant(state)).toBe(rcsPropellant(before));
    expect(state.equipment['battery-a']!.values.charge).toBeGreaterThanOrEqual(
      before.equipment['battery-a']!.values.charge!,
    );
    expect(state.equipment['battery-b']!.values.charge).toBeGreaterThanOrEqual(
      before.equipment['battery-b']!.values.charge!,
    );
    expect(Object.values(state.equipment).every((e) => e.condition === 1 && !e.tripped)).toBe(true);
    for (const [id, temperature] of Object.entries(state.thermal))
      expect(Math.abs(temperature - at48[id]!)).toBeLessThan(0.02);
    expect(maximumResidual).toBeLessThan(1e-4);
    expect(state.equipment['battery-a']!.values.output).toBe(0);
    expect(state.equipment['battery-b']!.values.output).toBe(0);
    expect((state.ext!.power as Record<string, number>).fuelGenerated).toBe(0);
    console.info(
      '3A 72 h transit',
      JSON.stringify({
        temperatures: state.thermal,
        maximumResidual,
        storedJ: [
          state.equipment['battery-a']!.values.charge,
          state.equipment['battery-b']!.values.charge,
        ],
        fuelConsumed: 0,
        rcsConsumed: 0,
      }),
    );
  },
);
