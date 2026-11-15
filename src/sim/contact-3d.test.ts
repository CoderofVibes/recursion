/**
 * Clearance and contact in three dimensions: the hull's prisms against body and asteroid
 * spheres. Faces, edges and corners; passes above the hull; several prisms; hits that spin the
 * ship about more than one axis; fast passes; a tumbling hull.
 */

import { describe, expect, it } from 'vitest';
import type { HullPrism, Inertia, MassProperties } from '../contracts/ship.ts';
import type { ShipKinematics } from '../contracts/truth/index.ts';
import * as quat from '../lib/quat.ts';
import { createRng } from '../lib/rng.ts';
import type { Vec3 } from '../lib/vec3.ts';
import {
  createGeometryResult,
  createPrismResult,
  packPrism,
  pointHull,
  pointPrism,
  segmentHull,
  segmentPolygon,
  segmentPrism,
  sweepPolygon,
  type PackedPrism,
} from './geometry.ts';
import { createSimulation, validateWorld } from './simulation.ts';
import {
  BOX_HULL,
  actuators,
  asteroid,
  body,
  makeWorld,
  massProps,
  thrust,
} from './test-helpers.ts';
import type { ContactDetail } from './types.ts';

const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const len = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);

/** The 14 m × 4 m box outline, from z = −1 to 1.5 (caps at different heights on purpose). */
const prism = packPrism(BOX_HULL, -1, 1.5);

describe('point against a prism', () => {
  const g = createPrismResult();
  const at = (x: number, y: number, z: number) => {
    pointPrism(x, y, z, prism, g);
    return {
      distance: g.distance,
      q: [g.qx, g.qy, g.qz],
      n: [g.nx, g.ny, g.nz],
    };
  };

  it('beside, above and below: distance to a wall or a cap, normal along it', () => {
    expect(at(10, 0, 0)).toEqual({ distance: 3, q: [7, 0, 0], n: [1, 0, 0] });
    expect(at(0, 0, 4)).toEqual({ distance: 2.5, q: [0, 0, 1.5], n: [0, 0, 1] });
    expect(at(1, 1, -3)).toEqual({ distance: 2, q: [1, 1, -1], n: [0, 0, -1] });
  });

  it('off an edge and off a corner: the hypotenuse, normal toward the point', () => {
    const edge = at(10, 0, 5.5); // 3 out, 4 up from the top edge at x = 7
    expect(edge.distance).toBe(5);
    expect(edge.q).toEqual([7, 0, 1.5]);
    expect(edge.n[0]).toBeCloseTo(0.6, 15);
    expect(edge.n[1]).toBe(0);
    expect(edge.n[2]).toBeCloseTo(0.8, 15);
    const corner = at(9, 5, 7.5); // (2, 3, 6) from the corner (7, 2, 1.5)
    expect(corner.distance).toBeCloseTo(7, 14);
    expect(corner.q).toEqual([7, 2, 1.5]);
    expect(corner.n[0]).toBeCloseTo(2 / 7, 15);
    expect(corner.n[1]).toBeCloseTo(3 / 7, 15);
    expect(corner.n[2]).toBeCloseTo(6 / 7, 15);
  });

  it('inside: negative, to the nearest wall or cap, normal pointing out', () => {
    expect(at(6.5, 0, 0)).toEqual({ distance: -0.5, q: [7, 0, 0], n: [1, 0, 0] });
    expect(at(0, 0, 1.2).distance).toBeCloseTo(-0.3, 15);
    expect(at(0, 0, 1.2).q).toEqual([0, 0, 1.5]);
    expect(at(0, 0, 1.2).n).toEqual([0, 0, 1]);
    expect(at(0, 0, -0.9).n).toEqual([0, 0, -1]);
  });

  it('inside at exactly mid-height the caps tie and the side wall is used', () => {
    const symmetric = packPrism(BOX_HULL, -2, 2);
    pointPrism(0, 0.5, 0, symmetric, g); // 1.5 from the wall y = 2, 2 from either cap
    expect(g.distance).toBe(-1.5);
    expect(g.nz).toBe(0);
    pointPrism(0, 0, 0, symmetric, g); // 2 from walls and caps alike
    expect(g.distance).toBe(-2);
    expect(g.nz).toBe(0);
  });

  it('on the surface: zero distance and no normal', () => {
    pointPrism(7, 0, 0, prism, g);
    expect(g.distance).toBe(0);
    expect([g.nx, g.ny, g.nz]).toEqual([0, 0, 0]);
  });

  it('a hull of several prisms: the nearest one', () => {
    const fin = packPrism(
      [
        { x: -4, y: 2 },
        { x: 0, y: 2 },
        { x: 0, y: 6 },
        { x: -4, y: 6 },
      ],
      -0.1,
      0.1,
    );
    const hull = [prism, fin];
    pointHull(-2, 5, 3, hull, g); // above the fin
    expect(g.distance).toBeCloseTo(2.9, 14);
    expect([g.nx, g.ny, g.nz]).toEqual([0, 0, 1]);
    pointHull(3, 0, 3, hull, g); // above the body
    expect(g.distance).toBe(1.5);
  });
});

describe('segment against a prism', () => {
  const g = createPrismResult();
  const planar = createGeometryResult();

  it('inside the slab it is exactly the planar problem', () => {
    const rng = createRng('segment-in-slab').stream('segments');
    for (let i = 0; i < 200; i++) {
      const ax = rng.range(-30, 30);
      const ay = rng.range(-30, 30);
      const bx = rng.range(-30, 30);
      const by = rng.range(-30, 30);
      const r = rng.range(0, 6);
      segmentPrism(ax, ay, rng.range(-1, 1.5), bx, by, rng.range(-1, 1.5), prism, r, g);
      segmentPolygon(ax, ay, bx, by, prism.outline, prism.n, planar);
      expect(g.distance).toBe(planar.distance);
      expect(g.tau).toBe(planar.tau);
      const hit = planar.distance <= r ? sweepPolygon(ax, ay, bx, by, prism.outline, 4, r) : -1;
      expect(g.hit).toBe(hit);
    }
  });

  it('passing above, parallel to the top: the gap, at the middle of the flat stretch', () => {
    segmentPrism(20, 0, 5, -20, 0, 5, prism, 4, g);
    expect(g.distance).toBeCloseTo(3.5, 12);
    expect(g.tau).toBeCloseTo(0.5, 7);
    // Within 4 of the prism once it is √(4² − 3.5²) short of the top edge at x = 7.
    expect(g.hit).toBeCloseTo((20 - 7 - Math.sqrt(16 - 3.5 * 3.5)) / 40, 11);
    segmentPrism(20, 0, 5, -20, 0, 5, prism, 3, g);
    expect(g.hit).toBe(-1); // never within 3
  });

  it('coming down onto the top face, onto an edge and onto a corner', () => {
    segmentPrism(0, 0, 10, 0, 0, 0, prism, 1, g);
    expect(g.distance).toBe(0); // ends inside
    expect(g.hit).toBeCloseTo((10 - 2.5) / 10, 12);
    // Toward the top edge at (7, ·, 1.5) along the diagonal in x–z, from 10√2 away.
    segmentPrism(17, 0, 11.5, 7, 0, 1.5, prism, 1, g);
    expect(g.hit).toBeCloseTo(1 - 1 / (10 * Math.SQRT2), 12);
    // Toward the corner (7, 2, 1.5) along (1, 1, 1), from 10√3 away.
    segmentPrism(17, 12, 11.5, 7, 2, 1.5, prism, 1, g);
    expect(g.hit).toBeCloseTo(1 - 1 / (10 * Math.sqrt(3)), 12);
  });

  it('agrees with a brute-force scan for segments in general position', () => {
    const rng = createRng('segment-search').stream('segments');
    const scratch = createPrismResult();
    const f = (a: Vec3, b: Vec3, tau: number): number =>
      pointPrism(
        a.x + tau * (b.x - a.x),
        a.y + tau * (b.y - a.y),
        a.z + tau * (b.z - a.z),
        prism,
        scratch,
      ).distance;
    let searched = 0;
    for (let i = 0; i < 300; i++) {
      const a = { x: rng.range(-40, 40), y: rng.range(-25, 25), z: rng.range(-25, 25) };
      const b = { x: rng.range(-40, 40), y: rng.range(-25, 25), z: rng.range(-25, 25) };
      if (a.z >= -1 && a.z <= 1.5 && b.z >= -1 && b.z <= 1.5) continue; // the planar path
      searched++;
      // Scan, then scan again around the best sample.
      let best = Infinity;
      let bestTau = 0;
      for (let k = 0; k <= 4000; k++) {
        const d = f(a, b, k / 4000);
        if (d < best) {
          best = d;
          bestTau = k / 4000;
        }
      }
      for (let k = -2000; k <= 2000; k++) {
        const tau = Math.min(1, Math.max(0, bestTau + k / 8_000_000));
        best = Math.min(best, f(a, b, tau));
      }
      const r = Math.max(0.2, best) + rng.range(0.1, 4);
      segmentPrism(a.x, a.y, a.z, b.x, b.y, b.z, prism, r, g);
      expect(Math.abs(g.distance - Math.max(best, 0))).toBeLessThan(1e-7);
      expect(Math.max(0, f(a, b, g.tau)) - g.distance).toBeLessThan(1e-7); // τ is at the minimum
      // The first time within r: at r there, outside r just before, and nothing earlier.
      expect(g.hit).toBeGreaterThanOrEqual(0);
      expect(f(a, b, g.hit)).toBeLessThanOrEqual(r);
      if (g.hit > 0) {
        expect(f(a, b, g.hit)).toBeGreaterThan(r - 1e-9);
        for (let k = 0; k / 4000 < g.hit - 1e-9; k++) expect(f(a, b, k / 4000)).toBeGreaterThan(r);
      }
      // A radius the segment never comes within.
      segmentPrism(a.x, a.y, a.z, b.x, b.y, b.z, prism, Math.max(best, 0) * 0.5, g);
      if (best > 1e-6) expect(g.hit).toBe(-1);
    }
    expect(searched).toBeGreaterThan(250);
  });

  it('a hull of several prisms: smallest distance and earliest hit over all of them', () => {
    const fin = packPrism(
      [
        { x: -4, y: 2 },
        { x: 0, y: 2 },
        { x: 0, y: 6 },
        { x: -4, y: 6 },
      ],
      -0.1,
      0.1,
    );
    // Straight down at (−2, 5): onto the fin's top at z = 0.1, 3 m clear of the body's wall.
    segmentHull(-2, 5, 10, -2, 5, -10, [prism, fin], 1, g);
    expect(g.distance).toBe(0);
    expect(g.hit).toBeCloseTo((10 - 1.1) / 20, 12);
    segmentHull(-2, 5, 10, -2, 5, -10, [prism], 1, g);
    expect(g.distance).toBe(3);
    expect(g.hit).toBe(-1);
  });
});

// ---------------------------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------------------------

/**
 * The reported impulse must be the one that was applied, and it must do what an impulse along
 * the normal with restitution e does: Δv = −(j/m)·n, Δω = −I⁻¹(r × j·n), and the hull point's
 * speed along the normal, relative to the object, reverses to e times what it was.
 */
function expectConsistentImpulse(
  mp: MassProperties,
  e: number,
  objectVelocity: Vec3,
  before: ShipKinematics,
  after: ShipKinematics,
  c: ContactDetail,
): void {
  const n = quat.rotate(after.attitude, c.normal);
  const rBody = sub(c.point, mp.centerOfMass);
  const dv = sub(after.velocity, before.velocity);
  expect(len(sub(dv, scale(n, -c.impulse / mp.mass)))).toBeLessThan(1e-9);
  const torque = cross(rBody, scale(c.normal, c.impulse));
  const p = quat.rotateInverse(mp.inertia.axes, torque);
  const { moments } = mp.inertia;
  const dw = quat.rotate(mp.inertia.axes, {
    x: -p.x / moments.x,
    y: -p.y / moments.y,
    z: -p.z / moments.z,
  });
  expect(len(sub(sub(after.angularVelocity, before.angularVelocity), dw))).toBeLessThan(1e-12);
  const pointVelocity = (k: ShipKinematics): Vec3 =>
    sub(
      add(k.velocity, quat.rotate(after.attitude, cross(k.angularVelocity, rBody))),
      objectVelocity,
    );
  const closing = dot(pointVelocity(before), n);
  expect(closing).toBeGreaterThan(0);
  expect(dot(pointVelocity(after), n)).toBeCloseTo(-e * closing, 9);
}

describe('impact in three dimensions', () => {
  const mp = massProps(); // box hull 14 × 4 × 4 m, centre of mass at its centre

  it('a sphere coming down on the top face: time, point, normal, rebound, no spin', () => {
    // A 5 m asteroid falling at 20 m/s onto the ship from 100 m above: the top is 2 m up.
    const world = makeWorld({
      mp,
      asteroids: [asteroid('a-01', { x: 0, y: 0, z: 100 }, { x: 0, y: 0, z: -20 }, 5)],
    });
    const sim = createSimulation(world, { dt: 1, restitution: 0.2 });
    const r = sim.run(sim.initial, 30, { stopOnImpact: true });
    expect(r.steps).toBe(5);
    const impact = r.events.find((e) => e.kind === 'impact');
    if (impact?.kind !== 'impact') throw new Error('no impact');
    expect(impact.t).toBeCloseTo((100 - 5 - 2) / 20, 9);
    expect(impact.relativeSpeed).toBeCloseTo(20, 9);
    expect(impact.point.x).toBeCloseTo(0, 9);
    expect(impact.point.y).toBeCloseTo(0, 9);
    expect(impact.point.z).toBeCloseTo(2, 9);
    const c = r.contacts[0]!;
    expect(c.normal).toEqual({ x: 0, y: 0, z: 1 });
    expect(c.impulse).toBeCloseTo(1.2 * 20 * mp.mass, 3); // through the centre of mass
    const k = r.state.world.ship.kinematics;
    expect(k.velocity.z).toBeCloseTo(-24, 9); // leaves the asteroid (−20) at e·20
    expect(k.velocity.x).toBe(0);
    expect(k.velocity.y).toBe(0);
    expect(k.angularVelocity).toEqual({ x: 0, y: 0, z: 0 });
    expect(k.position.z).toBeCloseTo(-7, 6); // left touching: the asteroid's centre is at 0
    expect(r.state.contacts).toEqual(['a-01']);
    expect(r.state.specificForce.z).toBeCloseTo(-24, 6); // the accelerometer feels it
    expectConsistentImpulse(mp, 0.2, { x: 0, y: 0, z: -20 }, world.ship.kinematics, k, c);
  });

  it('a sphere meeting an edge between the side and the top', () => {
    // Along the diagonal in y–z toward the edge at y = 2, z = 2.
    const v = { x: 0, y: -10, z: -10 };
    const world = makeWorld({ mp, asteroids: [asteroid('a-01', { x: 0, y: 52, z: 52 }, v, 5)] });
    const sim = createSimulation(world, { dt: 1 });
    const r = sim.run(sim.initial, 30, { stopOnImpact: true });
    const c = r.contacts[0]!;
    expect(c.t).toBeCloseTo((50 - 5 / Math.SQRT2) / 10, 9);
    expect(c.point.x).toBeCloseTo(0, 9);
    expect(c.point.y).toBeCloseTo(2, 9);
    expect(c.point.z).toBeCloseTo(2, 9);
    expect(c.normal.x).toBeCloseTo(0, 12);
    expect(c.normal.y).toBeCloseTo(Math.SQRT1_2, 9);
    expect(c.normal.z).toBeCloseTo(Math.SQRT1_2, 9);
    const k = r.state.world.ship.kinematics;
    // The edge point is straight out from the centre of mass along the normal: no spin.
    expect(len(k.angularVelocity)).toBeLessThan(1e-9);
    expect(k.velocity.y).toBeCloseTo(-12, 6);
    expect(k.velocity.z).toBeCloseTo(-12, 6);
    expectConsistentImpulse(mp, 0.2, v, world.ship.kinematics, k, c);
  });

  it('a sphere meeting a corner: an off-centre hit that spins the ship about two axes', () => {
    const v = { x: -10, y: -10, z: -10 };
    const world = makeWorld({ mp, asteroids: [asteroid('a-01', { x: 37, y: 32, z: 32 }, v, 5)] });
    const sim = createSimulation(world, { dt: 1 });
    const r = sim.run(sim.initial, 30, { stopOnImpact: true });
    const c = r.contacts[0]!;
    expect(c.t).toBeCloseTo((30 - 5 / Math.sqrt(3)) / 10, 9);
    expect(c.point.x).toBeCloseTo(7, 9);
    expect(c.point.y).toBeCloseTo(2, 9);
    expect(c.point.z).toBeCloseTo(2, 9);
    for (const n of [c.normal.x, c.normal.y, c.normal.z])
      expect(n).toBeCloseTo(1 / Math.sqrt(3), 9);
    // r × n = (7, 2, 2) × (1, 1, 1)/√3 = (0, −5, 5)/√3: pitch and yaw, no roll.
    const k = r.state.world.ship.kinematics;
    const j = (1.2 * 30) / Math.sqrt(3) / (1 / mp.mass + 50 / 3 / 2.0e5);
    expect(c.impulse).toBeCloseTo(j, 3);
    expect(k.angularVelocity.x).toBeCloseTo(0, 9);
    expect(k.angularVelocity.y).toBeCloseTo((j * 5) / Math.sqrt(3) / 2.0e5, 9);
    expect(k.angularVelocity.z).toBeCloseTo((-j * 5) / Math.sqrt(3) / 2.0e5, 9);
    expectConsistentImpulse(mp, 0.2, v, world.ship.kinematics, k, c);
  });

  it('with a full inertia tensor the same hit turns the ship about all three axes', () => {
    const inertia: Inertia = {
      moments: { x: 3.0e4, y: 1.6e5, z: 2.0e5 },
      axes: quat.normalize({ w: 0.95, x: 0.2, y: 0.1, z: -0.15 }),
    };
    const tilted = massProps({ inertia, centerOfMass: { x: 0.4, y: -0.2, z: 0.3 } });
    const v = { x: -10, y: -10, z: -10 };
    const world = makeWorld({
      mp: tilted,
      asteroids: [asteroid('a-01', { x: 37, y: 32, z: 32 }, v, 5)],
    });
    const sim = createSimulation(world, { dt: 1, restitution: 0.35 });
    const r = sim.run(sim.initial, 30, { stopOnImpact: true });
    const c = r.contacts[0]!;
    const k = r.state.world.ship.kinematics;
    expect(Math.abs(k.angularVelocity.x)).toBeGreaterThan(0.01);
    expect(Math.abs(k.angularVelocity.y)).toBeGreaterThan(0.01);
    expect(Math.abs(k.angularVelocity.z)).toBeGreaterThan(0.01);
    expectConsistentImpulse(tilted, 0.35, v, world.ship.kinematics, k, c);
  });

  it('a tumbling ship: the hull point’s own speed (ω × r) is part of the impact', () => {
    // The ship drifts sideways into a rock while turning about all three axes.
    const spin = { x: 0.3, y: -0.2, z: 0.25 };
    const rock = { x: 0, y: 0, z: 0 };
    const start = { mp, velocity: { x: 0.5, y: 3, z: -1 }, angularRate: spin };
    const world = makeWorld({
      ...start,
      asteroids: [asteroid('a-01', { x: 4, y: 40, z: -12 }, rock, 6)],
    });
    const sim = createSimulation(world, { dt: 0.05, restitution: 0.3 });
    const r = sim.run(sim.initial, 600, { stopOnImpact: true });
    expect(r.events.filter((e) => e.kind === 'impact')).toHaveLength(1);
    const c = r.contacts[0]!;
    const k = r.state.world.ship.kinematics;
    // The same flight with no rock gives the state the impulse was applied to.
    const free = createSimulation(makeWorld(start), { dt: 0.05 });
    const before = free.run(free.initial, r.steps).state.world.ship.kinematics;
    expect(before.attitude).toEqual(k.attitude); // an impulse does not turn the ship at once
    // The contact point is on the hull's surface, and moving at a speed the spin adds to.
    const g = createPrismResult();
    expect(
      Math.abs(
        pointHull(c.point.x, c.point.y, c.point.z, [packPrism(BOX_HULL, -2, 2)], g).distance,
      ),
    ).toBeLessThan(1e-9);
    expectConsistentImpulse(mp, 0.3, rock, before, k, c);
    const pointSpeed = len(
      add(
        before.velocity,
        quat.rotate(k.attitude, cross(before.angularVelocity, sub(c.point, mp.centerOfMass))),
      ),
    );
    expect(c.relativeSpeed).toBeCloseTo(pointSpeed, 9);
    expect(Math.abs(pointSpeed - len(before.velocity))).toBeGreaterThan(0.2);
  });

  it('works in the body frame: a ship standing on its tail is hit on the nose', () => {
    // Pitched so body +x points along inertial +z; the asteroid comes down the z axis.
    const noseUp = quat.fromAxisAngle({ x: 0, y: 1, z: 0 }, -Math.PI / 2);
    expect(quat.axisX(noseUp).z).toBeCloseTo(1, 15);
    const world = makeWorld({
      mp,
      attitude: noseUp,
      asteroids: [asteroid('a-01', { x: 0, y: 0, z: 100 }, { x: 0, y: 0, z: -20 }, 5)],
    });
    const sim = createSimulation(world, { dt: 1 });
    const r = sim.run(sim.initial, 30, { stopOnImpact: true });
    const c = r.contacts[0]!;
    expect(c.t).toBeCloseTo((100 - 5 - 7) / 20, 9); // the nose is 7 m up
    expect(c.point.x).toBeCloseTo(7, 9);
    expect(c.point.y).toBeCloseTo(0, 9);
    expect(c.point.z).toBeCloseTo(0, 9);
    expect(c.normal.x).toBeCloseTo(1, 12);
    expect(r.state.world.ship.kinematics.velocity.z).toBeCloseTo(-24, 9);
    expect(r.state.specificForce.x).toBeCloseTo(-24, 6); // along the body axis
  });

  it('pushing down onto an object holds the hull at its surface, with one impact event', () => {
    const world = makeWorld({
      mp,
      velocity: { x: 0, y: 0, z: -5 },
      asteroids: [asteroid('a-01', { x: 0, y: 0, z: -50 }, { x: 0, y: 0, z: 0 }, 5)],
    });
    const sim = createSimulation(world, { dt: 1, restitution: 0 });
    const push = actuators([thrust({ x: 0, y: 0, z: 2 }, { x: 0, y: 0, z: -5000 })], mp);
    const r = sim.run(sim.initial, 60, { input: () => ({ actuators: push }) });
    expect(r.events.filter((e) => e.kind === 'impact')).toHaveLength(1);
    expect(r.state.contacts).toEqual(['a-01']);
    const z = r.state.world.ship.kinematics.position.z;
    expect(z).toBeGreaterThanOrEqual(-50 + 5 + 2 - 1e-6); // the keel is 2 m below the CoM
    expect(z).toBeLessThan(-50 + 5 + 2 + 1);
    expect(r.contacts.filter((c) => !c.impact).length).toBeGreaterThan(0);
    for (const c of r.contacts) expect(c.normal).toEqual({ x: 0, y: 0, z: -1 });
  });
});

describe('passing over the hull', () => {
  /** A 5 m asteroid flying along x at 100 m/s, 8 m above the ship's centre line. */
  const pass = (hull: readonly HullPrism[]) => {
    const world = makeWorld({
      mp: massProps({ hull }),
      asteroids: [asteroid('a-01', { x: -500, y: 0, z: 8 }, { x: 100, y: 0, z: 0 }, 5)],
    });
    const sim = createSimulation(world, { dt: 1 });
    return sim.run(sim.initial, 40);
  };

  it('misses a hull 2 m tall above its centre by 1 m: one clearance event, no impact', () => {
    const r = pass([{ outline: BOX_HULL, zMin: -2, zMax: 2 }]);
    expect(r.events.filter((e) => e.kind === 'impact')).toHaveLength(0);
    const minima = r.events.filter((e) => e.kind === 'clearance');
    expect(minima).toHaveLength(1);
    const m = minima[0]!;
    if (m.kind !== 'clearance') throw new Error();
    expect(m.distance).toBeCloseTo(8 - 2 - 5, 9);
    // Flat while the asteroid is over the top, 4.93–5.07 s; reported inside that stretch.
    expect(m.t).toBeGreaterThanOrEqual(4.93 - 1e-9);
    expect(m.t).toBeLessThanOrEqual(5.07 + 1e-9);
  });

  it('hits a hull 4 m tall above its centre, on the leading top edge', () => {
    const r = pass([{ outline: BOX_HULL, zMin: -2, zMax: 4 }]);
    const impact = r.events.find((e) => e.kind === 'impact');
    if (impact?.kind !== 'impact') throw new Error('no impact');
    // 4 m above the top edge at x = −7, so 3 m short of it when 5 m away.
    expect(impact.t).toBeCloseTo((500 - 7 - 3) / 100, 9);
    expect(impact.point.x).toBeCloseTo(-7, 9);
    expect(impact.point.z).toBeCloseTo(4, 9);
    const c = r.contacts[0]!;
    expect(c.normal.x).toBeCloseTo(-0.6, 9);
    expect(c.normal.y).toBeCloseTo(0, 12);
    expect(c.normal.z).toBeCloseTo(0.8, 9);
  });
});

describe('a hull of several prisms', () => {
  const bodyPrism: HullPrism = { outline: BOX_HULL, zMin: -2, zMax: 2 };
  /** A thin panel standing out from the port side. */
  const panel: HullPrism = {
    outline: [
      { x: -4, y: 2 },
      { x: 0, y: 2 },
      { x: 0, y: 6 },
      { x: -4, y: 6 },
    ],
    zMin: -0.1,
    zMax: 0.1,
  };
  /** A 1 m rock falling straight down 3 m off the port side. */
  const drop = (hull: readonly HullPrism[]) => {
    const world = makeWorld({
      mp: massProps({ hull }),
      asteroids: [asteroid('a-01', { x: -2, y: 5, z: 50 }, { x: 0, y: 0, z: -10 }, 1)],
    });
    const sim = createSimulation(world, { dt: 1 });
    return { world, result: sim.run(sim.initial, 30, { stopOnImpact: true }) };
  };

  it('the rock misses the body alone by 2 m', () => {
    const { result } = drop([bodyPrism]);
    expect(result.steps).toBe(30);
    expect(result.events.filter((e) => e.kind === 'impact')).toHaveLength(0);
    const minima = result.events.filter((e) => e.kind === 'clearance');
    expect(minima).toHaveLength(1);
    if (minima[0]!.kind !== 'clearance') throw new Error();
    expect(minima[0]!.distance).toBeCloseTo(5 - 2 - 1, 9);
    // Alongside the body from z = 2 to −2: 4.8–5.2 s.
    expect(minima[0]!.t).toBeGreaterThanOrEqual(4.8 - 1e-9);
    expect(minima[0]!.t).toBeLessThanOrEqual(5.2 + 1e-9);
  });

  it('and lands on the panel when it is out: contact on the panel, roll and pitch', () => {
    const { world, result } = drop([bodyPrism, panel]);
    const c = result.contacts[0]!;
    expect(c.t).toBeCloseTo((50 - 0.1 - 1) / 10, 9);
    expect(c.point.x).toBeCloseTo(-2, 9);
    expect(c.point.y).toBeCloseTo(5, 9);
    expect(c.point.z).toBeCloseTo(0.1, 9);
    expect(c.normal).toEqual({ x: 0, y: 0, z: 1 });
    const k = result.state.world.ship.kinematics;
    // r × n = (−2, 5, 0.1) × ẑ = (5, 2, 0): pushed down on the port side, aft of centre.
    expect(k.angularVelocity.x).toBeLessThan(-0.01);
    expect(k.angularVelocity.y).toBeLessThan(-0.004);
    expect(k.angularVelocity.z).toBeCloseTo(0, 12);
    expectConsistentImpulse(
      world.ship.systems.massProperties,
      0.2,
      { x: 0, y: 0, z: -10 },
      world.ship.kinematics,
      k,
      c,
    );
  });
});

describe('no tunnelling at speed', () => {
  it('a rock crossing the whole hull within one step is caught on the face it meets', () => {
    // 5 km/s straight down: 5 km per step against a hull 4 m thick.
    const world = makeWorld({
      asteroids: [asteroid('a-01', { x: 3, y: 1, z: 22_502 }, { x: 0, y: 0, z: -5000 }, 0.5)],
    });
    const sim = createSimulation(world, { dt: 1 });
    const r = sim.run(sim.initial, 30, { stopOnImpact: true });
    const impact = r.events.find((e) => e.kind === 'impact');
    if (impact?.kind !== 'impact') throw new Error('no impact');
    expect(impact.t).toBeCloseTo((22_502 - 2.5) / 5000, 9);
    expect(impact.relativeSpeed).toBeCloseTo(5000, 6);
    expect(impact.point.x).toBeCloseTo(3, 6);
    expect(impact.point.y).toBeCloseTo(1, 6);
    expect(impact.point.z).toBeCloseTo(2, 6);
  });

  it('a 20 km/s rock from far outside the clearance range, on a skew line through the hull', () => {
    const speed = 20_000;
    const from = { x: 91_300, y: 61_700, z: 123_456 };
    const aim = { x: 2, y: -0.5, z: 0.7 }; // a point inside the hull
    const dir = scale(sub(aim, from), 1 / len(sub(aim, from)));
    const world = makeWorld({
      asteroids: [asteroid('a-01', from, scale(dir, speed), 2)],
    });
    const sim = createSimulation(world, { dt: 1 });
    const r = sim.run(sim.initial, 30, { stopOnImpact: true });
    const impact = r.events.find((e) => e.kind === 'impact');
    if (impact?.kind !== 'impact') throw new Error('no impact');
    expect(impact.relativeSpeed).toBeCloseTo(speed, 6);
    // At the reported time the rock's centre is exactly its radius from the hull.
    const centre = add(from, scale(dir, speed * impact.t));
    const g = createPrismResult();
    const hull: PackedPrism[] = [packPrism(BOX_HULL, -2, 2)];
    expect(pointHull(centre.x, centre.y, centre.z, hull, g).distance).toBeCloseTo(2, 6);
    expect(impact.point.x).toBeCloseTo(g.qx, 6);
    expect(impact.point.y).toBeCloseTo(g.qy, 6);
    expect(impact.point.z).toBeCloseTo(g.qz, 6);
  });
});

describe('clearance in three dimensions', () => {
  it('a hull tumbling about all three axes gives one event per pass', () => {
    const mp = massProps({
      inertia: { moments: { x: 3.0e4, y: 1.6e5, z: 2.0e5 }, axes: quat.IDENTITY },
    });
    const world = makeWorld({
      mp,
      velocity: { x: 100, y: 0, z: 0 },
      angularRate: { x: 1.1, y: 0.7, z: 2 },
      asteroids: [asteroid('a-01', { x: 1000, y: 30, z: 12 }, { x: 0, y: 0, z: 0 }, 5)],
    });
    const sim = createSimulation(world, { dt: 0.05 });
    const r = sim.run(sim.initial, 800);
    const minima = r.events.filter((e) => e.kind === 'clearance');
    expect(minima).toHaveLength(1);
    if (minima[0]!.kind !== 'clearance') throw new Error();
    // The centre of mass passes √(30² + 12²) from the rock's centre; the hull reaches between
    // 2 m (a side) and √(7² + 2² + 2²) ≈ 7.55 m (a corner) toward it.
    const com = Math.hypot(30, 12) - 5;
    expect(minima[0]!.distance).toBeGreaterThan(com - Math.hypot(7, 2, 2) - 1e-9);
    expect(minima[0]!.distance).toBeLessThan(com - 2);
    expect(Math.abs(minima[0]!.t - 10)).toBeLessThan(0.2);
    // It really tumbled: the rates wandered between the axes.
    const w = r.state.world.ship.kinematics.angularVelocity;
    expect(Math.abs(w.x - 1.1) + Math.abs(w.y - 0.7) + Math.abs(w.z - 2)).toBeGreaterThan(0.1);
  });

  it('measures far objects from the centre of mass, in three dimensions', () => {
    const world = makeWorld({
      velocity: { x: 100, y: 0, z: 0 },
      asteroids: [asteroid('a-01', { x: 1234, y: 12_000, z: 16_000 }, { x: 0, y: 0, z: 0 }, 5)],
    });
    const sim = createSimulation(world, { dt: 1 });
    const minima = sim.run(sim.initial, 40).events.filter((e) => e.kind === 'clearance');
    expect(minima).toHaveLength(1);
    expect(minima[0]!.t).toBeCloseTo(12.34, 9);
    if (minima[0]!.kind !== 'clearance') throw new Error();
    expect(minima[0]!.distance).toBeCloseTo(20_000 - 5, 9);
  });

  it('gives the step minimum to an object straight above', () => {
    const world = makeWorld({
      velocity: { x: 0, y: 0, z: -100 },
      asteroids: [asteroid('a-01', { x: 0, y: 0, z: 500 }, { x: 0, y: 0, z: 0 }, 5)],
    });
    const sim = createSimulation(world, { dt: 1 });
    const r = sim.step(sim.initial);
    expect(r.events).toHaveLength(0); // receding from the start
    expect(r.minClearance?.with).toBe('a-01');
    expect(r.minClearance?.distance).toBeCloseTo(500 - 5 - 2, 9); // from the top face
  });

  it('step by step and run give the same events and contacts in three dimensions', () => {
    const world = makeWorld({
      velocity: { x: 100, y: 0.5, z: -3 },
      angularRate: { x: 0.02, y: -0.01, z: 0.03 },
      asteroids: [
        asteroid('a-01', { x: 1000, y: 30, z: -25 }, { x: -2, y: 0, z: 1 }, 5),
        asteroid('a-02', { x: 2500, y: -40, z: -60 }, { x: 0, y: 1, z: 0.5 }, 12),
        asteroid('a-03', { x: 3500, y: 16, z: -106 }, { x: 0, y: 0, z: 0 }, 8),
      ],
    });
    const sim = createSimulation(world, { dt: 1 });
    const bulk = sim.run(sim.initial, 60);
    let s = sim.initial;
    const events = [];
    const contacts = [];
    for (let i = 0; i < 60; i++) {
      const r = sim.step(s);
      events.push(...r.events);
      contacts.push(...r.contacts);
      s = r.state;
    }
    expect(events).toEqual(bulk.events);
    expect(contacts).toEqual(bulk.contacts);
    expect(s).toEqual(bulk.state);
    expect(bulk.events.filter((e) => e.kind === 'clearance')).toHaveLength(2);
    expect(bulk.events.filter((e) => e.kind === 'impact')).toHaveLength(1); // a-03, head on
  });
});

describe('asteroids, bodies and validation in three dimensions', () => {
  it('an asteroid falling onto a body from above is absorbed; one passing over it is not', () => {
    const world = makeWorld({
      position: { x: 0, y: 5e6, z: 0 },
      bodies: [body('alpha', 1e10, 250e3, { x: 0, y: 0, z: 0 })],
      asteroids: [
        asteroid('falls', { x: 0, y: 0, z: 300e3 }, { x: 0, y: 0, z: 0 }, 50),
        // Starts exactly over the body's centre, 900 km up, far too fast to be captured.
        asteroid('passes', { x: 0, y: 0, z: 900e3 }, { x: 1200, y: 0, z: 0 }, 50),
      ],
    });
    const sim = createSimulation(world, { dt: 1 });
    const r = sim.run(sim.initial, 2000);
    expect(r.absorbed.map((a) => a.asteroid)).toEqual(['falls']);
    expect(r.absorbed[0]!.body).toBe('alpha');
    expect(r.state.world.asteroids.map((a) => a.id)).toEqual(['passes']);
  });

  it('checks overlap and "inside a body" with the distance in three dimensions', () => {
    // One above the other: they overlap in plan but are 1 km apart.
    const stacked = [
      body('a', 1, 10, { x: 0, y: 1e5, z: 0 }),
      body('b', 1, 10, { x: 0, y: 1e5, z: 1000 }),
    ];
    expect(validateWorld(makeWorld({ bodies: stacked }))).toEqual([]);
    expect(
      validateWorld(
        makeWorld({
          bodies: [
            body('a', 1, 10, { x: 0, y: 1e5, z: 0 }),
            body('b', 1, 10, { x: 0, y: 1e5, z: 15 }),
          ],
        }),
      ),
    ).toEqual(['bodies a and b overlap']);
    // The ship is right over the body's centre in plan, but above its surface.
    const under = [body('a', 1, 10, { x: 0, y: 0, z: -11 })];
    expect(validateWorld(makeWorld({ bodies: under }))).toEqual([]);
    expect(validateWorld(makeWorld({ bodies: [body('a', 1, 10, { x: 0, y: 0, z: -9 })] }))).toEqual(
      ['ship starts inside body a'],
    );
  });
});
