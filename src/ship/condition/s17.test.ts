import { expect, it } from 'vitest';
import { loadShipDefinition } from '../definition.ts';
import { createShipSystemsState } from '../state.ts';
import { environment } from '../test-helpers.ts';
import { stepPower } from '../power/index.ts';
import { energizedEquipment } from '../power/service.ts';
import { stepThermal } from '../thermal/index.ts';
import { integrateConditionedInterval } from './integrate.ts';
import { radiationProfiles, type Exposure } from './index.ts';

/** Independent polynomial integral for S17's straight-rock-gap compact mounts.
 * The production field stays with 3C. No average intensity or copied event finder. */
it('matches S17 camera and dual-PDU burnout times with real dispatch/heat within 1 ms', () => {
  const definition = loadShipDefinition();
  const initial = createShipSystemsState(definition);
  const ids = ['camera', 'pdu-a', 'pdu-b'];
  const curves = ids.map((id) => {
    const position = definition.equipment.find((e) => e.id === id)!.position;
    const b = Math.min(Math.abs(position.y), Math.abs(position.z));
    const limit = Math.sqrt(16 - b * b);
    const threshold = radiationProfiles(definition).get(id)!.burnoutIntensity;
    const reach = Math.sqrt(16 * (1 - (threshold / 20) ** 0.25) - b * b);
    const highStart = (24 - position.x - reach) / 2;
    const highEnd = (24 - position.x + reach) / 2;
    const primitive = (x: number) =>
      [1, 4, 6, 4, 1].reduce(
        (sum, binomial, k) =>
          sum +
          (20 * binomial * (1 - (b * b) / 16) ** (4 - k) * (-1) ** k * x ** (2 * k + 1)) /
            (16 ** k * (2 * k + 1)),
        0,
      ) / 2;
    const dose = (t: number) =>
      primitive(Math.max(-limit, Math.min(limit, -24 + 2 * t + position.x))) - primitive(-limit);
    return { id, highStart, highEnd, dose };
  });
  const result = integrateConditionedInterval(
    initial,
    definition,
    12,
    (state, remaining) => {
      const edge = Math.min(
        state.t + remaining,
        ...curves.flatMap((c) => [c.highStart, c.highEnd]).filter((t) => t > state.t + 1e-10),
      );
      const powered = stepPower(state, definition, environment(state), 0.0001).state;
      return {
        duration: edge - state.t,
        energized: energizedEquipment(powered, definition),
        sample: (dt): Exposure =>
          Object.fromEntries(
            curves.map((c) => [
              c.id,
              {
                rawDose: c.dose(state.t + dt) - c.dose(state.t),
                aboveBurnout: state.t >= c.highStart - 1e-10 && state.t < c.highEnd - 1e-10,
              },
            ]),
          ),
      };
    },
    (state, dt) => {
      const power = stepPower(state, definition, environment(state), dt);
      const thermal = stepThermal(power.state, definition, environment(state), dt);
      const ledger = thermal.state.ext!.thermal as Record<string, number>;
      expect(Math.abs(ledger.energyResidual!)).toBeLessThan(1e-4);
      return { state: thermal.state, events: [...power.events, ...thermal.events] };
    },
  );
  const expected: Record<string, number> = {
    camera: 7.8022441859,
    'pdu-a': 11.3457340755,
    'pdu-b': 11.3457340755,
  };
  for (const id of ids) {
    const event = result.events.find(
      (e) => e.kind === 'equipment-fault' && e.equipment === id && e.fault === 'radiation-burnout',
    );
    expect(event, id).toBeDefined();
    expect(Math.abs(event!.t - expected[id]!)).toBeLessThan(0.001);
    expect(result.state.equipment[id]!.condition).toBe(0);
  }
});
