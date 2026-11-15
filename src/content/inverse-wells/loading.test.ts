import { describe, expect, it } from 'vitest';
import { createTruthStepper } from '../../game/truth-step.ts';
import { encounterEntry } from '../../game/encounters.ts';
import { distance } from '../../lib/vec3.ts';

describe('Well Garden through the agreed 2F truth loop', () => {
  it('loads the registered S22 setup, applies coasting pull, and replays a saved state', () => {
    const setup = encounterEntry('inverse-wells').create(0);
    const stepper = createTruthStepper(setup);
    const ordinary = createTruthStepper({
      ...setup,
      definition: {
        ...setup.definition,
        world: { ...setup.definition.world, fields: [] },
      },
    });
    let a = stepper.initial;
    let b = ordinary.initial;
    for (let i = 0; i < 100; i++) {
      const commands =
        i === 0
          ? setup.arrivalCommands.map((command) => ({ command, source: 'procedure' as const }))
          : [];
      a = stepper.step(a, commands).state;
      b = ordinary.step(b, commands).state;
    }
    expect(a.lost).toBeUndefined();
    expect(a.sim.world.t).toBe(100);
    expect(
      distance(a.sim.world.ship.kinematics.velocity, b.sim.world.ship.kinematics.velocity),
    ).toBeGreaterThan(2);
    expect(a.sim.world.ship.systems.tanks).toEqual(b.sim.world.ship.systems.tanks);
    const restored = JSON.parse(JSON.stringify(a)) as typeof a;
    expect(stepper.step(restored)).toEqual(stepper.step(a));
    // Birth-state persistence and structural throat policy are separately requested shared seams.
  });
});
