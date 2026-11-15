/**
 * Orbit planes that are not the x–y plane: `circularBinary` with a normal, the invariants as
 * vectors, the Jacobi constant for any binary plane, and the same scene flown in two planes.
 */

import { describe, expect, it } from 'vitest';
import type { GravityLaw, TruthWorld } from '../contracts/truth/index.ts';
import * as v3 from '../lib/vec3.ts';
import type { Vec3 } from '../lib/vec3.ts';
import { circularBinary, circularBinaryPlane } from './analytic.ts';
import { accelerationFrom, coupling } from './gravity.ts';
import * as inv from './invariants.ts';
import { createSimulation } from './simulation.ts';
import { makeWorld } from './test-helpers.ts';

const law: GravityLaw = { exponent: 2.5, referenceRadius: 1e6 };
const alpha = { id: 'alpha', name: 'Alpha', gm: 1e10, radius: 250e3 };
const beta = { id: 'beta', name: 'Beta', gm: 2.5e9, radius: 160e3 };
const D = 4e6;
/** About 40° from +z. */
const NORMAL: Vec3 = { x: 0.5, y: -0.4, z: 0.8 };

describe('circularBinary in any plane', () => {
  it('the default plane gives exactly the planar numbers', () => {
    for (const phase of [0, 0.7, 2.2, -1.9, Math.PI]) {
      for (const sense of [1, -1] as const) {
        const { bodies, angularRate, angularVelocity } = circularBinary(law, alpha, beta, D, {
          phase,
          sense,
          barycenter: { x: 3, y: -4, z: 5 },
          barycenterVelocity: { x: 0.1, y: 0.2, z: -0.3 },
        });
        // The planar construction (2A): offsets along (cos, sin), velocities ω ẑ × offset.
        const omega =
          sense * Math.sqrt((coupling(alpha.gm, law) + coupling(beta.gm, law)) / D ** 3.5);
        const qB = beta.gm / (alpha.gm + beta.gm);
        const expected = [-qB * D, (1 - qB) * D].map((offset) => {
          const px = offset * Math.cos(phase);
          const py = offset * Math.sin(phase);
          return {
            position: { x: 3 + px, y: -4 + py, z: 5 },
            velocity: { x: 0.1 - omega * py, y: 0.2 + omega * px, z: -0.3 },
          };
        });
        expect(angularRate).toBe(omega);
        expect(angularVelocity).toEqual({ x: 0, y: 0, z: omega });
        expect(bodies.map((b) => ({ position: b.position, velocity: b.velocity }))).toEqual(
          expected,
        );
        // Naming the default normal changes nothing.
        const named = circularBinary(law, alpha, beta, D, {
          phase,
          sense,
          barycenter: { x: 3, y: -4, z: 5 },
          barycenterVelocity: { x: 0.1, y: 0.2, z: -0.3 },
          normal: { x: 0, y: 0, z: 1 },
        });
        expect(named.bodies).toEqual(bodies);
      }
    }
  });

  it('the plane axes: +x and +y carried by the smallest rotation of +z onto the normal', () => {
    expect(circularBinaryPlane()).toEqual({ normal: v3.UNIT_Z, e1: v3.UNIT_X, e2: v3.UNIT_Y });
    const { normal, e1, e2 } = circularBinaryPlane(NORMAL);
    expect(v3.length(normal)).toBeCloseTo(1, 15);
    expect(v3.angleBetween(normal, NORMAL)).toBeLessThan(1e-15);
    expect(v3.dot(e1, normal)).toBeCloseTo(0, 15);
    expect(v3.dot(e2, normal)).toBeCloseTo(0, 15);
    expect(v3.dot(e1, e2)).toBeCloseTo(0, 15);
    expect(v3.length(v3.sub(v3.cross(e1, e2), normal))).toBeLessThan(1e-15); // right-handed
    // A plane tilted a little keeps its axes close to x and y.
    const slight = circularBinaryPlane({ x: 0.01, y: 0, z: 1 });
    expect(v3.angleBetween(slight.e1, v3.UNIT_X)).toBeLessThan(0.011);
    expect(v3.angleBetween(slight.e2, v3.UNIT_Y)).toBeLessThan(1e-12);
    // Upside down: a half-turn about +x.
    const flipped = circularBinaryPlane({ x: 0, y: 0, z: -2 });
    expect(flipped.e1.x).toBeCloseTo(1, 15);
    expect(flipped.e2.y).toBeCloseTo(-1, 15);
    expect(() => circularBinaryPlane({ x: 0, y: 0, z: 0 })).toThrow(/normal/);
  });

  it('an inclined binary: in its plane, about its barycentre, turning about its normal', () => {
    const { normal, e1, e2 } = circularBinaryPlane(NORMAL);
    const phase = 0.9;
    for (const sense of [1, -1] as const) {
      const { bodies, angularRate, angularVelocity } = circularBinary(law, alpha, beta, D, {
        normal: NORMAL,
        phase,
        sense,
      });
      const [a, b] = bodies;
      const line = v3.sub(b.position, a.position);
      expect(v3.length(line)).toBeCloseTo(D, 6);
      // The line from A to B is at `phase` from e1 toward e2.
      expect(Math.atan2(v3.dot(line, e2), v3.dot(line, e1))).toBeCloseTo(phase, 14);
      for (const body of bodies) {
        expect(Math.abs(v3.dot(body.position, normal))).toBeLessThan(1e-9);
        expect(Math.abs(v3.dot(body.velocity, normal))).toBeLessThan(1e-14);
        expect(Math.abs(v3.dot(body.velocity, body.position))).toBeLessThan(1e-7); // circular
      }
      expect(angularVelocity).toEqual(v3.scale(normal, angularRate));
      expect(Math.sign(angularRate)).toBe(sense);
      const world = makeWorld({ law, bodies: [...bodies] });
      expect(v3.length(inv.barycenter(world))).toBeLessThan(1e-9);
      expect(v3.length(inv.barycentricVelocity(world))).toBeLessThan(1e-14);
      // The bodies' angular momentum lies along the normal, with the orbit's sense.
      const h = inv.bodiesSpecificAngularMomentumVector(world);
      expect(v3.angleBetween(h, v3.scale(normal, sense))).toBeLessThan(1e-14);
    }
  });
});

describe('invariants as vectors', () => {
  it('the scalar angular momenta are the z components of the vectors', () => {
    const { bodies } = circularBinary(law, alpha, beta, D, { normal: NORMAL, phase: 0.4 });
    const world = makeWorld({
      law,
      bodies: [...bodies],
      position: { x: 1e6, y: -2e6, z: 3e5 },
      velocity: { x: 40, y: 25, z: -60 },
    });
    const about = { x: 100, y: 200, z: 300 };
    const h = inv.shipSpecificAngularMomentumVector(world, about);
    const { position: p, velocity: v } = world.ship.kinematics;
    expect(h).toEqual(v3.cross(v3.sub(p, about), v));
    expect(inv.shipSpecificAngularMomentum(world, about)).toBe(h.z);
    expect(inv.bodiesSpecificAngularMomentum(world)).toBe(
      inv.bodiesSpecificAngularMomentumVector(world).z,
    );
  });

  it('the Jacobi constant takes the binary rate as a number about +z or as a vector', () => {
    const { bodies, angularRate, angularVelocity } = circularBinary(law, alpha, beta, D);
    const world = makeWorld({
      law,
      bodies: [...bodies],
      position: { x: 0, y: 6e6, z: 4e5 },
      velocity: { x: -60, y: 0, z: 12 },
    });
    expect(inv.shipJacobiConstant(world, angularVelocity)).toBe(
      inv.shipJacobiConstant(world, angularRate),
    );
  });

  it('gravity in three dimensions: K/rⁿ along the line of centres', () => {
    const k = coupling(1e10, law);
    const source = { x: 1e5, y: -2e5, z: 3e5 };
    const at = { x: 7e5, y: 1e5, z: -3e5 };
    const a = accelerationFrom(k, 2.5, source, at);
    const r = v3.distance(source, at);
    expect(v3.length(a)).toBeCloseTo(k / r ** 2.5, 14);
    expect(v3.angleBetween(a, v3.sub(source, at))).toBeLessThan(1e-15); // toward the source
    // In the x–y plane it is the planar form.
    const planar = accelerationFrom(k, 2.5, 1e5, -2e5, 7e5, 1e5);
    const lifted = accelerationFrom(k, 2.5, { x: 1e5, y: -2e5, z: 0 }, { x: 7e5, y: 1e5, z: 0 });
    expect(lifted).toEqual({ ...planar, z: 0 });
  });
});

describe('an inclined binary over three periods', () => {
  it('stays circular in its plane; momentum, energy and the ship Jacobi constant hold', () => {
    const { bodies, angularVelocity } = circularBinary(law, alpha, beta, D, {
      normal: NORMAL,
      phase: 1.3,
    });
    const { normal, e1, e2 } = circularBinaryPlane(NORMAL);
    // The ship starts off the binary's plane, moving across it.
    const position = v3.add(v3.addScaled(v3.scale(e2, 6e6), e1, 2e5), v3.scale(normal, 8e5));
    const velocity = v3.add(v3.scale(e1, -60), v3.scale(normal, -25));
    const world = makeWorld({ law, bodies: [...bodies], position, velocity });
    const sim = createSimulation(world, { dt: 1 });
    const e0 = inv.bodiesSpecificEnergy(world);
    const h0 = inv.bodiesSpecificAngularMomentumVector(world);
    const c0 = inv.shipJacobiConstant(world, angularVelocity);
    let eErr = 0;
    let hErr = 0;
    let vBary = 0;
    let cErr = 0;
    let sepErr = 0;
    let offPlane = 0;
    let shipOff = 0;
    sim.run(sim.initial, 2_000_000, {
      sampleEvery: 1000,
      onSample: (s) => {
        const w = s.world;
        eErr = Math.max(eErr, Math.abs(inv.bodiesSpecificEnergy(w) / e0 - 1));
        const h = inv.bodiesSpecificAngularMomentumVector(w);
        hErr = Math.max(hErr, v3.length(v3.sub(h, h0)) / v3.length(h0));
        vBary = Math.max(vBary, v3.length(inv.barycentricVelocity(w)));
        cErr = Math.max(cErr, Math.abs(inv.shipJacobiConstant(w, angularVelocity) / c0 - 1));
        const [a, b] = w.bodies;
        sepErr = Math.max(sepErr, Math.abs(v3.distance(a!.position, b!.position) / D - 1));
        for (const body of w.bodies)
          offPlane = Math.max(offPlane, Math.abs(v3.dot(body.position, normal)));
        shipOff = Math.max(shipOff, Math.abs(v3.dot(w.ship.kinematics.position, normal)));
      },
    });
    expect(vBary).toBeLessThan(1e-12); // pairwise forces are equal and opposite in every axis
    expect(hErr).toBeLessThan(1e-11); // the angular-momentum vector, so the plane too
    expect(eErr).toBeLessThan(1e-10);
    expect(sepErr).toBeLessThan(1e-9); // stays circular
    expect(offPlane).toBeLessThan(1e-3); // metres, on a 4,000 km orbit
    expect(cErr).toBeLessThan(1e-9);
    expect(shipOff).toBeGreaterThan(5e5); // the ship really was out of the plane
  });
});

describe('the same scene in two planes', () => {
  it('a tilted copy of a planar flight is that flight, tilted', () => {
    const planar = circularBinary(law, alpha, beta, D, { phase: 0.6 });
    const tilted = circularBinary(law, alpha, beta, D, { phase: 0.6, normal: NORMAL });
    const { e1, e2 } = circularBinaryPlane(NORMAL);
    const tilt = (p: Vec3): Vec3 => v3.add(v3.scale(e1, p.x), v3.scale(e2, p.y));
    const position = { x: -3e5, y: 1.3e6, z: 0 };
    const velocity = { x: -70, y: 30, z: 0 };
    const flat: TruthWorld = makeWorld({ law, bodies: [...planar.bodies], position, velocity });
    const up: TruthWorld = makeWorld({
      law,
      bodies: [...tilted.bodies],
      position: tilt(position),
      velocity: tilt(velocity),
    });
    const a = createSimulation(flat, { dt: 1 });
    const b = createSimulation(up, { dt: 1 });
    const endFlat = a.run(a.initial, 20_000).state.world;
    const endUp = b.run(b.initial, 20_000).state.world;
    // Rounding differs between the two frames; the dynamics amplify it, but not much in 20,000 s.
    expect(
      v3.distance(endUp.ship.kinematics.position, tilt(endFlat.ship.kinematics.position)),
    ).toBeLessThan(1e-5);
    expect(
      v3.distance(endUp.ship.kinematics.velocity, tilt(endFlat.ship.kinematics.velocity)),
    ).toBeLessThan(1e-9);
    for (let i = 0; i < 2; i++) {
      expect(
        v3.distance(endUp.bodies[i]!.position, tilt(endFlat.bodies[i]!.position)),
      ).toBeLessThan(1e-6);
    }
    expect(endFlat.ship.kinematics.position.z).toBe(0); // and the planar one stayed planar
  });
});
