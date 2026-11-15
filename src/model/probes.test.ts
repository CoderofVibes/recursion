/**
 * Tracked asteroids (1G spec §10, DECISIONS A6): probes of the law at distances the ship has not
 * flown, and tracks for clearance in forecasts.
 *
 * Synthetic scenario in the inverse-2.5 world (μ = 1e10, r0 = 1000 km): the ship coasts from
 * 1.0 to 1.3 r0 while its camera fixes body A and an asteroid circling at about 0.55–0.7 r0.
 * Truth comes from the believed-dynamics integrator run with the true law and a 15 s step (the
 * integrator itself is checked against 1G's and 1B's references); it is used only to make
 * measurements and to judge results.
 */

import { describe, expect, it } from 'vitest';
import {
  cov3FromPlanar,
  isotropicInertia,
  prismHull,
  type AttemptRecord,
  type MassProperties,
  type Measurement,
  type Plan,
} from '../contracts/index.ts';
import * as quat from '../lib/quat.ts';
import { createRng } from '../lib/rng.ts';
import { compileArc, simulate, type Structure, type ThrustSegment } from './dynamics.ts';
import type { ModelContext } from './engine.ts';
import { fromRows } from './linalg.ts';
import { ModelService } from './service.ts';
import { mahalanobis } from './tierL.ts';
import { testShip } from './vector-harness.ts';

const R0 = 1e6;
const MU = 1e10;
const N = 2.5;
const MASS = 30000;
const THRUST = 0.15 * MASS;
const KE = 0.97;
const DE = 0.004;

const potential = (r: number) => -(MU * Math.pow(R0, N - 2)) / ((N - 1) * Math.pow(r, N - 1));
/** Speed at an apsis rFrom of an orbit whose other apsis is rTo (P4 law, energy and h). */
const apsisSpeed = (rFrom: number, rTo: number) =>
  Math.sqrt((2 * (potential(rTo) - potential(rFrom))) / (1 - (rFrom / rTo) ** 2));

function truthAt(
  state: readonly number[],
  times: readonly number[],
  commands: readonly ThrustSegment[] = [],
) {
  const [x, y, vx, vy] = state as [number, number, number, number];
  const st: Structure = {
    r0: R0,
    n: N,
    bodies: [{ id: 'A', mu: MU, state: 'gauge' }],
    ship: [x, y, 0, vx, vy, 0],
    dynamicBodies: false,
    engine: { kE: KE, dE: DE, dP: 0 },
    kA: 1,
    camBias: [0, 0, 0],
  };
  const tr = simulate(
    compileArc(st, { id: 'truth', epoch: 0, commands }, new Map()),
    [],
    times,
    15,
  );
  return tr.pos.map((p, k) => [p[3]!, p[4]!, tr.vel[k]![3]!, tr.vel[k]![4]!] as const);
}

// Ship from pericentre at 1.0 r0 toward apocentre at 1.3 r0; asteroid on a 0.55–0.7 r0 orbit.
const SHIP0 = [R0, 0, 0, apsisSpeed(R0, 1.3 * R0)];
const AST0 = [0, -0.55 * R0, apsisSpeed(0.55 * R0, 0.7 * R0), 0];
const STEP = 120;
const scan = Array.from({ length: 800 }, (_, i) => i * STEP);
const shipScan = truthAt(SHIP0, scan);
/** Now: the ship at apocentre (largest distance over the first radial half-period). */
const kApo = shipScan.reduce(
  (best, s, k) =>
    Math.hypot(s[0], s[1]) > Math.hypot(shipScan[best]![0], shipScan[best]![1]) ? k : best,
  0,
);
const NOW = scan[kApo]!;

function record(withAsteroid: boolean): AttemptRecord {
  const rng = createRng(2701).stream(withAsteroid ? 'with' : 'without');
  const times = scan.filter((t) => t <= NOW);
  const ship = truthAt(SHIP0, times);
  const ast = truthAt(AST0, times);
  const ms: Measurement[] = [];
  const sb = 4.1e-5;
  times.forEach((t, k) => {
    const fix = (id: string, dx: number, dy: number) => {
      const r = Math.hypot(dx, dy);
      ms.push({
        kind: 'bearing',
        t,
        source: 'cam',
        target: id,
        value: [Math.atan2(dy, dx) + rng.normal(0, sb), 0],
        sigma: [sb, sb],
      });
      ms.push({
        kind: 'range',
        t,
        source: 'cam',
        target: id,
        value: [r + rng.normal(0, 2e-3 * r)],
        sigma: [2e-3 * r],
      });
    };
    const s = ship[k]!;
    fix('A', -s[0], -s[1]);
    if (withAsteroid) fix('ast-1', ast[k]![0] - s[0], ast[k]![1] - s[1]);
  });
  return {
    id: 'att1',
    index: 1,
    encounterId: 'range',
    startedAt: '2026-11-14T13:00:00Z',
    start: {
      estimate: {
        t: 0,
        position: { x: R0, y: 0, z: 0 },
        velocity: { x: 0, y: SHIP0[3]!, z: 0 },
        positionCov: cov3FromPlanar([1e8, 0, 1e8]),
        velocityCov: cov3FromPlanar([1, 0, 1]),
        attitude: quat.fromYaw(0),
        attitudeSigma: 1e-3,
        angularVelocity: { x: 0, y: 0, z: 0 },
      },
      configuration: 'stowed',
      modelVersion: 0,
    },
    plans: [],
    executed: [],
    forecasts: [],
    measurements: ms,
    events: [],
    outcome: { kind: 'in-progress' },
    modelVersionAtEnd: 0,
  };
}

const ctx: ModelContext = {
  encounterId: 'range',
  priors: [
    { id: 'body.A.mu', label: 'A μ', unit: 'm³/s²', value: 1.02e10, sigma: 3e8 },
    { id: 'thruster.main.scale', label: 'kE', unit: '', value: KE, sigma: 0.003 },
    { id: 'thruster.main.misalignment', label: 'dE', unit: 'rad', value: DE, sigma: 0.001 },
  ],
  bodies: [
    {
      id: 'A',
      name: 'A',
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      positionCov: cov3FromPlanar([1e6, 0, 1e6]),
      radius: 2.5e5,
      tracked: true,
    },
  ],
  asteroids: [
    {
      id: 'ast-1',
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      positionCov: cov3FromPlanar([1e10, 0, 1e10]),
      radius: 5e3,
      tracked: true,
    },
  ],
  ship: testShip(MASS, THRUST),
  arrival: record(false).start.estimate,
  settings: { dt: 60, planar: 1 },
};

// The scenarios in this file are planar (z = 0, yaw-only attitude, flat hull): the model runs
// them in the planar reduction (`planar: 1`, spec Appendix A.3), as the planar model did.
const massProperties: MassProperties = {
  mass: MASS,
  centerOfMass: { x: 0, y: 0, z: 0 },
  inertia: isotropicInertia(1e5),
  hull: prismHull(
    [
      { x: -5, y: -2 },
      { x: 5, y: -2 },
      { x: 5, y: 2 },
      { x: -5, y: 2 },
    ],
    0,
    0,
  ),
};

// A retrograde burn at apocentre that drops pericentre to 0.6 r0: below every distance the ship flew.
const shipNow = shipScan[kApo]!;
const rNow = Math.hypot(shipNow[0], shipNow[1]);
const vNow = Math.hypot(shipNow[2], shipNow[3]);
const dv = vNow - apsisSpeed(rNow, 0.6 * R0);
const burnTime = Math.round(dv / (0.15 * KE));
const theta = Math.atan2(-shipNow[3], -shipNow[2]);
const dive: Plan = {
  id: 'dive',
  epoch: NOW,
  items: [
    {
      id: 'b',
      at: 0,
      command: {
        kind: 'burn',
        thruster: 'main',
        throttle: 1,
        duration: burnTime,
        attitude: { reference: 'inertial', attitude: quat.fromYaw(theta) },
      },
    },
  ],
};
const HOURS = 10;
const truthDiveTimes = Array.from({ length: (HOURS * 3600) / 600 + 1 }, (_, i) => NOW + i * 600);
const truthDive = truthAt(SHIP0, truthDiveTimes, [
  { t0: NOW, t1: NOW + burnTime, u: 0.15, q: quat.fromYaw(theta), thruster: 'main' },
]);
const truthAst = truthAt(AST0, truthDiveTimes);

function service(withAsteroid: boolean, path: 'refresh' | 'refit') {
  const svc = new ModelService(ctx);
  svc.load({ attempts: [] });
  svc.beginAttempt(record(withAsteroid));
  if (path === 'refresh') svc.refresh();
  else svc.refit();
  return svc;
}

describe('tracked asteroids probe the law where the ship has not flown (spec §10)', () => {
  const svc = service(true, 'refresh');
  const bare = service(false, 'refresh');

  it('builds a probe arc and adds its windows at the asteroid’s distances', () => {
    const probes = svc.snapshot.derived.probes.get('att1')!;
    expect(probes.map((a) => a.id)).toEqual(['att1@ast-1']);
    const strength = svc.report().strength.find((b) => b.body === 'A')!;
    const ship = strength.points.filter((p) => !p.probe);
    const probe = strength.points.filter((p) => p.probe === 'ast-1');
    expect(ship.length).toBeGreaterThanOrEqual(3);
    expect(probe.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...probe.map((p) => p.rMax))).toBeLessThan(0.75 * R0);
    expect(Math.min(...ship.map((p) => p.rMin))).toBeGreaterThan(0.95 * R0);
    // Every local GM, the asteroid's included, follows the true law: μ0 (r0/r)^0.5.
    for (const p of strength.points) {
      const theory = MU * Math.sqrt(R0 / p.distance);
      expect(Math.abs(p.gm - theory), p.window).toBeLessThan(3 * p.gmSigma + 0.01 * theory);
    }
    // Ship and probe windows together say the exponent is 2.5; the ship alone covers too little.
    expect(Math.abs(strength.slope! + 0.5)).toBeLessThan(0.05);
    const cal = svc.state.calibration.find((c) => c.body === 'A')!;
    expect(cal.distances[0]!).toBeLessThan(0.6 * R0);
    expect(svc.state.support.distance.A![0]![0]).toBeLessThan(0.6 * R0);
    const bareCal = bare.state.calibration.find((c) => c.body === 'A')!;
    expect(bareCal.distances[0]!).toBeGreaterThan(0.9 * R0);
  });

  it('a full Tier G (refit) gives the same probe windows within their sigmas', () => {
    const refit = service(true, 'refit');
    const a = svc.report().strength[0]!.points.filter((p) => p.probe);
    const b = refit.report().strength[0]!.points.filter((p) => p.probe);
    expect(b.length).toBe(a.length);
    // The two paths use different reference laws (priors against Tier G), so compare local GM.
    a.forEach((p, i) => expect(Math.abs(p.gm - b[i]!.gm)).toBeLessThan(p.gmSigma));
  });

  it('forecasts the asteroid with an honest envelope and reports the clearance', () => {
    const { draft, detail } = svc.forecast({
      id: 'f',
      issuedAt: NOW,
      plan: { id: 'coast', epoch: NOW, items: [] },
      massProperties,
      step: 600,
      duration: 4 * 3600,
    });
    expect(detail.asteroids).toEqual([expect.objectContaining({ id: 'ast-1', forecast: true })]);
    const track = draft.objects.find((o) => o.id === 'ast-1')!;
    expect(track.samples.length).toBeGreaterThan(10);
    for (const s of track.samples) {
      const k = truthDiveTimes.indexOf(s.t);
      const truth = truthAst[k]!;
      const cov = fromRows([
        [s.positionCov[0], s.positionCov[1]],
        [s.positionCov[1], s.positionCov[3]],
      ]);
      expect(
        mahalanobis([truth[0] - s.position.x, truth[1] - s.position.y], cov),
        `t=${s.t}`,
      ).toBeLessThan(3);
    }
    const ca = draft.closestApproaches.find((c) => c.id === 'ast-1')!;
    const coastShip = truthAt(
      SHIP0,
      truthDiveTimes.filter((t) => t <= NOW + 4 * 3600),
    );
    const trueMin =
      Math.min(
        ...coastShip.map((s, k) => Math.hypot(s[0] - truthAst[k]![0], s[1] - truthAst[k]![1])),
      ) -
      5e3 -
      Math.hypot(5, 2);
    expect(Math.abs(ca.distance - trueMin)).toBeLessThan(3 * ca.sigma + 1e3);
    expect(
      bare
        .forecast({
          id: 'g',
          issuedAt: NOW,
          plan: { id: 'coast', epoch: NOW, items: [] },
          massProperties,
          step: 600,
          duration: 3600,
        })
        .draft.objects.some((o) => o.id === 'ast-1'),
    ).toBe(false);
  });

  it('lets a dive below the ship’s own distances be forecast without the hedge', () => {
    const run = (s: ModelService) =>
      s.forecast({
        id: 'd',
        issuedAt: NOW,
        plan: dive,
        massProperties,
        step: 600,
        duration: HOURS * 3600,
      });
    const probed = run(svc);
    const blind = run(bare);
    const deep = (f: typeof probed) =>
      f.draft.samples.filter((q) => Math.hypot(q.position.x, q.position.y) < 0.75 * R0);
    // With the asteroid's windows the dive reaches 0.6 r0 inside calibrated distances: no hedge.
    expect(deep(probed).length).toBeGreaterThanOrEqual(3);
    expect(
      deep(probed).every((q) => !q.extrapolating),
      'probed extrapolating',
    ).toBe(true);
    const sig = new Map(probed.detail.sigmaMajor.map((q) => [q.t, q]));
    expect(
      deep(probed).every((q) => sig.get(q.t)!.hedge < 1),
      'no hedge where probed',
    ).toBe(true);
    for (const q of probed.draft.samples) {
      const truth = truthDive[truthDiveTimes.indexOf(q.t)]!;
      const cov = fromRows([
        [q.positionCov[0], q.positionCov[1]],
        [q.positionCov[1], q.positionCov[3]],
      ]);
      expect(
        mahalanobis([truth[0] - q.position.x, truth[1] - q.position.y], cov),
        `t=${q.t}`,
      ).toBeLessThan(3);
    }
    // Without it the same dive leaves the sampled distances and the hedge takes over.
    expect(blind.draft.samples.some((q) => q.extrapolating)).toBe(true);
    expect(Math.max(...blind.detail.sigmaMajor.map((q) => q.hedge))).toBeGreaterThan(1e3);
    expect(probed.draft.horizon).toBeGreaterThanOrEqual(blind.draft.horizon);
  });
});
