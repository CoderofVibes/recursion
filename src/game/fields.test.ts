/**
 * Encounter fields reach the simulation (R1): a world with fields loads through the truth step
 * with the setup's registry, a field's acceleration moves the ship, and a field's intensity
 * reaches the ship's environment at each equipment item and the raw exposure account.
 */

import { describe, expect, it } from 'vitest';
import { createFieldRegistry, type FieldFactory } from '../contracts/truth/index.ts';
import { createGravityRange } from '../content/gravity-range/index.ts';
import type { EncounterSetup } from './encounter.ts';
import { createTruthStepper } from './truth-step.ts';

const range = createGravityRange();

/** A uniform push along +z, m/s², everywhere. */
const push: FieldFactory = {
  kind: 'test-push',
  create: (spec) => ({
    id: spec.id,
    kind: spec.kind,
    acceleration: () => ({ x: 0, y: 0, z: (spec.params as { a: number }).a }),
  }),
};
/** A uniform glow of the given intensity, lattice units, everywhere. */
const glow: FieldFactory = {
  kind: 'test-glow',
  create: (spec) => ({
    id: spec.id,
    kind: spec.kind,
    intensity: () => (spec.params as { i: number }).i,
  }),
};

function withFields(
  fields: readonly { id: string; kind: string; params: Record<string, number> }[],
): EncounterSetup {
  const w = range.definition.world;
  return {
    ...range,
    definition: { ...range.definition, world: { ...w, fields } },
    fields: createFieldRegistry([push, glow]),
  };
}

describe('encounter fields in the truth step (R1)', () => {
  it('a world with fields needs the setup registry, and loads with it', () => {
    const setup = withFields([{ id: 'p', kind: 'test-push', params: { a: 1e-3 } }]);
    const { fields: _registry, ...bare } = setup;
    expect(() => createTruthStepper(bare)).toThrow(/no field registry/);
    expect(() => createTruthStepper(setup)).not.toThrow();
  });

  it("a field's acceleration moves the ship", () => {
    const plain = createTruthStepper(range);
    const pushed = createTruthStepper(
      withFields([{ id: 'p', kind: 'test-push', params: { a: 1e-3 } }]),
    );
    let a = plain.initial;
    let b = pushed.initial;
    for (let i = 0; i < 100; i++) {
      a = plain.step(a).state;
      b = pushed.step(b).state;
    }
    const dz = b.sim.world.ship.kinematics.velocity.z - a.sim.world.ship.kinematics.velocity.z;
    // 1e-3 m/s² for 100 s.
    expect(dz).toBeCloseTo(0.1, 3);
  });

  it("a field's intensity is sampled at every equipment item and kept as raw exposure", () => {
    const stepper = createTruthStepper(
      withFields([
        { id: 'g1', kind: 'test-glow', params: { i: 0.03 } },
        { id: 'g2', kind: 'test-glow', params: { i: 0.02 } },
      ]),
    );
    let state = stepper.initial;
    for (let i = 0; i < 10; i++) state = stepper.step(state).state;
    const exposure = state.exposure ?? {};
    const ids = range.definition.ship.equipment.map((e) => e.id);
    expect(Object.keys(exposure).sort()).toEqual([...ids].sort());
    // Two layers add: 0.05 U for 10 s is 0.5 U s, before any susceptibility.
    for (const id of ids) expect(exposure[id]).toBeCloseTo(0.5, 12);
    // Saves keep it.
    expect(JSON.parse(JSON.stringify(state)).exposure).toEqual(exposure);
  });

  it('no intensity field, no exposure account', () => {
    const stepper = createTruthStepper(range);
    const state = stepper.step(stepper.initial).state;
    expect(state.exposure).toBeUndefined();
  });
});
