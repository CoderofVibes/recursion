/**
 * Long coasts: what each set-up conserves stays conserved, with bounded (not growing) error.
 */

import { describe, expect, it } from 'vitest';
import { circularBinary } from './analytic.ts';
import * as inv from './invariants.ts';
import { createSimulation } from './simulation.ts';
import { body, makeWorld } from './test-helpers.ts';

const law = { exponent: 2.5, referenceRadius: 1e6 };

describe('long coasts', () => {
  it('isolated source: energy error bounded with no secular growth, h conserved', () => {
    // A rosette between about 495 and 1000 km: 2×10⁶ s is roughly 25 radial periods.
    const world = makeWorld({
      law,
      bodies: [body('alpha', 1e10, 250e3, { x: 0, y: 0 })],
      position: { x: 1e6, y: 0 },
      velocity: { x: 0, y: 90 },
    });
    const sim = createSimulation(world, { dt: 1 });
    const e0 = inv.shipSpecificEnergy(world);
    const h0 = inv.shipSpecificAngularMomentum(world);
    const N = 2_000_000;
    const quarter = [0, 0, 0, 0];
    let hErr = 0;
    const r = sim.run(sim.initial, N, {
      sampleEvery: 500,
      onSample: (s) => {
        const q = Math.min(3, Math.floor((s.tick - 1) / (N / 4)));
        quarter[q] = Math.max(quarter[q]!, Math.abs(inv.shipSpecificEnergy(s.world) / e0 - 1));
        hErr = Math.max(hErr, Math.abs(inv.shipSpecificAngularMomentum(s.world) / h0 - 1));
      },
    });
    expect(r.events.filter((e) => e.kind === 'impact')).toHaveLength(0);
    // Velocity Verlet: O(dt²) oscillating energy error, the same size in every quarter.
    expect(Math.max(...quarter)).toBeLessThan(1e-7);
    expect(quarter[3]!).toBeLessThan(1.2 * quarter[0]!);
    // A central force from a fixed source conserves h exactly in each kick and drift: only
    // rounding remains.
    expect(hErr).toBeLessThan(1e-11);
  });

  it('mutual binary: momentum, angular momentum and energy conserved; ship Jacobi constant holds', () => {
    const { bodies, angularRate } = circularBinary(
      law,
      { id: 'alpha', name: 'Alpha', gm: 1e10, radius: 250e3 },
      { id: 'beta', name: 'Beta', gm: 2.5e9, radius: 160e3 },
      4e6,
    );
    const world = makeWorld({
      law,
      bodies: [...bodies],
      position: { x: 0, y: 6e6 },
      velocity: { x: -60, y: 0 },
    });
    const sim = createSimulation(world, { dt: 1 });
    const e0 = inv.bodiesSpecificEnergy(world);
    const l0 = inv.bodiesSpecificAngularMomentum(world);
    const c0 = inv.shipJacobiConstant(world, angularRate);
    let eErr = 0;
    let lErr = 0;
    let vBary = 0;
    let cErr = 0;
    let sepErr = 0;
    // Two million seconds: about three binary periods.
    sim.run(sim.initial, 2_000_000, {
      sampleEvery: 1000,
      onSample: (s) => {
        const w = s.world;
        eErr = Math.max(eErr, Math.abs(inv.bodiesSpecificEnergy(w) / e0 - 1));
        lErr = Math.max(lErr, Math.abs(inv.bodiesSpecificAngularMomentum(w) / l0 - 1));
        const v = inv.barycentricVelocity(w);
        vBary = Math.max(vBary, Math.hypot(v.x, v.y));
        cErr = Math.max(cErr, Math.abs(inv.shipJacobiConstant(w, angularRate) / c0 - 1));
        const [a, b] = w.bodies;
        const d = Math.hypot(a!.position.x - b!.position.x, a!.position.y - b!.position.y);
        sepErr = Math.max(sepErr, Math.abs(d / 4e6 - 1));
      },
    });
    expect(vBary).toBeLessThan(1e-12); // pairwise forces are equal and opposite
    expect(lErr).toBeLessThan(1e-11);
    expect(eErr).toBeLessThan(1e-10);
    expect(sepErr).toBeLessThan(1e-9); // stays circular
    expect(cErr).toBeLessThan(1e-9);
  });

  it('a torque-free ship keeps its spin rate exactly', () => {
    const sim = createSimulation(makeWorld({ angularRate: 0.0123 }), { dt: 1 });
    const r = sim.run(sim.initial, 100_000);
    expect(r.state.world.ship.kinematics.angularRate).toBe(0.0123);
  });
});
