/**
 * Clearance and contact: the hull polygon against body and asteroid envelopes.
 */

import { describe, expect, it } from 'vitest';
import { createGeometryResult, pointPolygon, segmentPolygon, sweepPolygon } from './geometry.ts';
import { createSimulation } from './simulation.ts';
import { actuators, asteroid, body, makeWorld, massProps, thrust } from './test-helpers.ts';

const box = new Float64Array([-7, -2, 7, -2, 7, 2, -7, 2]);
// Non-convex: the box with a 4 m-deep notch cut into the top edge between x = −2 and 2.
const notched = new Float64Array([-7, -2, 7, -2, 7, 2, 2, 2, 2, -1, -2, -1, -2, 2, -7, 2]);

describe('geometry', () => {
  it('signed point–polygon distance and closest point', () => {
    const g = createGeometryResult();
    pointPolygon(10, 0, box, 4, g);
    expect(g.distance).toBe(3);
    expect([g.qx, g.qy]).toEqual([7, 0]);
    pointPolygon(0, 1, box, 4, g);
    expect(g.distance).toBe(-1);
    pointPolygon(10, 6, box, 4, g);
    expect(g.distance).toBe(5); // to the corner (7, 2)
    pointPolygon(0, 1, notched, 8, g);
    expect(g.distance).toBe(2); // inside the notch, 2 m above its floor
  });

  it('segment–polygon minimum and where along the segment it occurs', () => {
    const g = createGeometryResult();
    segmentPolygon(20, 10, -20, 10, box, 4, g); // passes above, parallel to the top edge
    expect(g.distance).toBe(8);
    expect(g.tau).toBeCloseTo(0.5, 12); // middle of the flat stretch
    segmentPolygon(20, -10, 20, 10, box, 4, g);
    expect(g.distance).toBe(13);
    expect(g.tau).toBeCloseTo(0.5, 12);
  });

  it('swept test finds a crossing a sampled test would tunnel through', () => {
    // Point path from x = 100 to x = −100 at y = 0, radius 1: enters at x = 8.
    const tau = sweepPolygon(100, 0, -100, 0, box, 4, 1);
    expect(tau).toBeCloseTo(92 / 200, 12);
    expect(sweepPolygon(100, 3.5, -100, 3.5, box, 4, 1)).toBe(-1); // clears by 0.5 m
    // Grazing the top: the corner circle at (7, 2) is met before the edge band.
    expect(sweepPolygon(100, 2.5, -100, 2.5, box, 4, 1)).toBeCloseTo(
      (93 - Math.sqrt(0.75)) / 200,
      12,
    );
    // Corner: from (20, 20) toward the corner (7, 2) along the diagonal direction.
    const d = Math.hypot(13, 18);
    expect(sweepPolygon(20, 20, 7, 2, box, 4, 1)).toBeCloseTo((d - 1) / d, 12);
  });
});

describe('impact', () => {
  // Ship at the origin heading +x at 100 m/s, a 5 m asteroid 1 km ahead. The 24 m overlap
  // window is shorter than one 100 m step, so only a swept test sees the hit.
  const mp = massProps();
  const world = makeWorld({
    mp,
    velocity: { x: 100, y: 0 },
    asteroids: [asteroid('a-01', { x: 1000, y: 0 }, { x: 0, y: 0 }, 5)],
  });

  it('detects the hit between ticks with time, speed, point and impulse', () => {
    const sim = createSimulation(world, { dt: 1, restitution: 0.2 });
    const r = sim.run(sim.initial, 30, { stopOnImpact: true });
    expect(r.steps).toBe(10);
    const impact = r.events.find((e) => e.kind === 'impact');
    expect(impact).toBeDefined();
    if (impact?.kind !== 'impact') throw new Error('no impact');
    expect(impact.with).toBe('a-01');
    expect(impact.t).toBeCloseTo((1000 - 5 - 7) / 100, 9); // nose meets the surface
    expect(impact.relativeSpeed).toBeCloseTo(100, 9);
    expect(impact.point.x).toBeCloseTo(7, 9);
    expect(impact.point.y).toBeCloseTo(0, 9);
    const c = r.contacts[0]!;
    expect(c.impact).toBe(true);
    expect(c.normal.x).toBeCloseTo(1, 12);
    expect(c.impulse).toBeCloseTo(1.2 * 100 * mp.mass, 3); // (1 + e)·v·m, through the CoM
    const k = r.state.world.ship.kinematics;
    expect(k.velocity.x).toBeCloseTo(-20, 9); // rebounds at e·v
    expect(k.angularVelocity.z).toBeCloseTo(0, 12);
    expect(k.position.x).toBeCloseTo(988, 6); // left touching the surface
    expect(r.state.contacts).toEqual(['a-01']);
    // The accelerometer feels the impulse.
    expect(r.state.specificForce.x).toBeCloseTo(-120, 6);
  });

  it('separates afterwards without further impacts', () => {
    const sim = createSimulation(world, { dt: 1 });
    const r = sim.run(sim.initial, 40);
    expect(r.events.filter((e) => e.kind === 'impact')).toHaveLength(1);
    expect(r.state.contacts).toEqual([]);
    expect(r.state.world.ship.kinematics.position.x).toBeLessThan(988);
  });

  it('an off-centre hit spins the ship', () => {
    const w = makeWorld({
      mp,
      velocity: { x: 100, y: 0 },
      asteroids: [asteroid('a-01', { x: 1000, y: 4 }, { x: 0, y: 0 }, 5)],
    });
    const sim = createSimulation(w, { dt: 1 });
    const r = sim.run(sim.initial, 30, { stopOnImpact: true });
    const c = r.contacts[0]!;
    expect(c.point.x).toBeCloseTo(7, 9);
    expect(c.point.y).toBeCloseTo(2, 9); // the top corner
    expect(r.state.world.ship.kinematics.angularVelocity.z).not.toBe(0);
  });

  it('pushing into an object keeps the hull outside, with one impact event', () => {
    const w = makeWorld({
      mp,
      velocity: { x: 5, y: 0 },
      asteroids: [asteroid('a-01', { x: 50, y: 0 }, { x: 0, y: 0 }, 5)],
    });
    const sim = createSimulation(w, { dt: 1, restitution: 0 });
    const push = actuators([thrust({ x: -7, y: 0 }, { x: 5000, y: 0 })], mp);
    const r = sim.run(sim.initial, 60, { input: () => ({ actuators: push }) });
    expect(r.events.filter((e) => e.kind === 'impact')).toHaveLength(1);
    expect(r.state.contacts).toEqual(['a-01']);
    const x = r.state.world.ship.kinematics.position.x;
    expect(x).toBeLessThanOrEqual(50 - 5 - 7 + 1e-6);
    expect(x).toBeGreaterThan(50 - 5 - 7 - 1); // held at the surface, not bounced away
    expect(r.contacts.filter((c) => !c.impact).length).toBeGreaterThan(0);
  });

  it('hitting a massive body is an impact with that body', () => {
    const w = makeWorld({
      mp,
      velocity: { x: 0, y: -50 },
      position: { x: 0, y: 2000 },
      bodies: [body('alpha', 0, 1000, { x: 0, y: 0 })],
    });
    const sim = createSimulation(w, { dt: 1 });
    const r = sim.run(sim.initial, 40, { stopOnImpact: true });
    const impact = r.events.find((e) => e.kind === 'impact');
    expect(impact?.kind === 'impact' && impact.with).toBe('alpha');
    expect(impact!.t).toBeCloseTo((2000 - 1000 - 2) / 50, 9); // the hull side is 2 m off the CoM
  });
});

describe('clearance', () => {
  it('reports one minimum per pass, at the right time and distance (hull)', () => {
    // Passing 30 m to port of a 5 m asteroid: the hull's port side is 2 m off the CoM.
    const w = makeWorld({
      velocity: { x: 100, y: 0 },
      asteroids: [asteroid('a-01', { x: 1000, y: 30 }, { x: 0, y: 0 }, 5)],
    });
    const sim = createSimulation(w, { dt: 1 });
    const r = sim.run(sim.initial, 40);
    const minima = r.events.filter((e) => e.kind === 'clearance');
    expect(minima).toHaveLength(1);
    const m = minima[0]!;
    if (m.kind !== 'clearance') throw new Error();
    expect(m.with).toBe('a-01');
    expect(m.distance).toBeCloseTo(30 - 5 - 2, 9);
    // Flat stretch while the asteroid is alongside, 9.93–10.07 s; reported inside it.
    expect(m.t).toBeGreaterThanOrEqual(9.93 - 1e-9);
    expect(m.t).toBeLessThanOrEqual(10.07 + 1e-9);
  });

  it('a spinning hull gives one event per pass, at its closest corner', () => {
    const w = makeWorld({
      velocity: { x: 100, y: 0 },
      angularRate: 2,
      asteroids: [asteroid('a-01', { x: 1000, y: 30 }, { x: 0, y: 0 }, 5)],
    });
    const sim = createSimulation(w, { dt: 0.05 });
    const minima = sim.run(sim.initial, 800).events.filter((e) => e.kind === 'clearance');
    expect(minima).toHaveLength(1);
    if (minima[0]!.kind !== 'clearance') throw new Error();
    // Between the corner's reach (√53 ≈ 7.28 m) and the side's (2 m) off the CoM.
    expect(minima[0]!.distance).toBeGreaterThan(30 - 5 - Math.hypot(7, 2) - 1e-9);
    expect(minima[0]!.distance).toBeLessThan(30 - 5 - 2);
  });

  it('measures far objects from the centre of mass', () => {
    const w = makeWorld({
      velocity: { x: 100, y: 0 },
      asteroids: [asteroid('a-01', { x: 1234, y: 20_000 }, { x: 0, y: 0 }, 5)],
    });
    const sim = createSimulation(w, { dt: 1 });
    const r = sim.run(sim.initial, 40);
    const minima = r.events.filter((e) => e.kind === 'clearance');
    expect(minima).toHaveLength(1);
    expect(minima[0]!.t).toBeCloseTo(12.34, 9);
    if (minima[0]!.kind !== 'clearance') throw new Error();
    expect(minima[0]!.distance).toBeCloseTo(20_000 - 5, 9);
  });

  it('reports a minimum that falls exactly on a tick once', () => {
    const w = makeWorld({
      velocity: { x: 100, y: 0 },
      asteroids: [asteroid('a-01', { x: 1000, y: 20_000 }, { x: 0, y: 0 }, 5)],
    });
    const sim = createSimulation(w, { dt: 1 });
    const minima = sim.run(sim.initial, 40).events.filter((e) => e.kind === 'clearance');
    expect(minima).toHaveLength(1);
    expect(minima[0]!.t).toBe(10);
  });

  it('gives the step minimum and no event while receding from the start', () => {
    const w = makeWorld({
      velocity: { x: -100, y: 0 },
      asteroids: [asteroid('a-01', { x: 500, y: 0 }, { x: 0, y: 0 }, 5)],
    });
    const sim = createSimulation(w, { dt: 1 });
    const r = sim.step(sim.initial);
    expect(r.events).toHaveLength(0);
    expect(r.minClearance?.with).toBe('a-01');
    expect(r.minClearance?.distance).toBeCloseTo(500 - 5 - 7, 9);
  });

  it('step-by-step and run give the same events', () => {
    const w = makeWorld({
      velocity: { x: 100, y: 0.5 },
      asteroids: [
        asteroid('a-01', { x: 1000, y: 30 }, { x: -2, y: 0 }, 5),
        asteroid('a-02', { x: 2500, y: -40 }, { x: 0, y: 1 }, 12),
      ],
    });
    const sim = createSimulation(w, { dt: 1 });
    const bulk = sim.run(sim.initial, 50).events;
    let s = sim.initial;
    const stepped = [];
    for (let i = 0; i < 50; i++) {
      const r = sim.step(s);
      stepped.push(...r.events);
      s = r.state;
    }
    expect(stepped).toEqual(bulk);
    expect(bulk.filter((e) => e.kind === 'clearance')).toHaveLength(2);
  });
});

describe('asteroids and bodies', () => {
  it('an asteroid that reaches a body leaves the world', () => {
    const w = makeWorld({
      position: { x: 0, y: 5e6 },
      bodies: [body('alpha', 1e10, 250e3, { x: 0, y: 0 })],
      asteroids: [asteroid('a-01', { x: 300e3, y: 0 }, { x: 0, y: 0 }, 50)],
    });
    const sim = createSimulation(w, { dt: 1 });
    const r = sim.run(sim.initial, 2000);
    expect(r.absorbed).toHaveLength(1);
    expect(r.absorbed[0]!.asteroid).toBe('a-01');
    expect(r.absorbed[0]!.body).toBe('alpha');
    expect(r.state.world.asteroids).toHaveLength(0);
  });

  it('rejects unsimulatable worlds', () => {
    expect(() =>
      createSimulation(
        makeWorld({
          bodies: [body('a', 1, 10, { x: 0, y: 1e3 }), body('a', 1, 10, { x: 0, y: 1e5 })],
        }),
        { dt: 1 },
      ),
    ).toThrow(/duplicate object id/);
    expect(() =>
      createSimulation(makeWorld({ bodies: [body('a', 1, 10, { x: 0, y: 0 })] }), { dt: 1 }),
    ).toThrow(/inside body a/);
    expect(() => createSimulation(makeWorld(), { dt: 0 })).toThrow(/dt/);
  });
});
