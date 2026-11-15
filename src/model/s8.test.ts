/**
 * S8's checks for the model (`docs/handoffs/s8.md`, request to 2C: "validate forecast
 * visibility/horizons and tracked-rock uncertainty on the supplied wrong-law and informed
 * inputs").
 *
 * S8's inputs are explicit states and impulses in the barycentric frame of the Gravity range's
 * circular binary under the inverse-2.5 law (`tools/studies/s8/vectors.json`, `ring-witness.json`).
 * Truth here is those states carried by the believed-dynamics integrator under the true law at a
 * 15 s step, checked first against S8's own independent propagation at its stated tolerances
 * (20 m, 2 mm/s, 120 s). The model then sees only what the ship would record: camera fixes
 * (azimuth and elevation at 4.1e-5 rad, range at 0.2%) every 120 s, star-tracker attitudes, and
 * each impulse as a near-instant executed burn; the briefing has the Gravity range's survey σ
 * and priors. Truth only builds measurements and judges results (P11). S8's author-side control
 * search is not used (S8's own instruction).
 */

import { describe, expect, it } from 'vitest';
import rawVectors from '../../tools/studies/s8/vectors.json?raw';
import rawWitness from '../../tools/studies/s8/ring-witness.json?raw';
import {
  isoCov3,
  isotropicInertia,
  prismHull,
  type AttemptRecord,
  type Cov3,
  type ExecutedCommand,
  type ForecastDraft,
  type MassProperties,
  type Measurement,
  type ParameterPrior,
  type Plan,
} from '../contracts/index.ts';
import * as quat from '../lib/quat.ts';
import { createRng } from '../lib/rng.ts';
import { compileArc, simulate, type State6, type Structure } from './dynamics.ts';
import type { ModelContext } from './engine.ts';
import { fromRows } from './linalg.ts';
import { ModelService } from './service.ts';
import { mahalanobis } from './tierL.ts';
import { testShip } from './vector-harness.ts';

type V3 = readonly [number, number, number];
interface S8Vectors {
  readonly tolerance: {
    readonly ship_position_m: number;
    readonly ship_velocity_m_s: number;
    readonly event_time_s: number;
  };
  readonly wrong_law: {
    readonly case: {
      readonly initial: { readonly position: V3; readonly velocity: V3 };
      readonly commands: readonly { readonly t: number; readonly delta_v_vector: V3 }[];
      readonly hit_t: number;
      readonly samples: readonly {
        readonly t: number;
        readonly position: V3;
        readonly velocity: V3;
        readonly alpha_range: number;
      }[];
    };
  };
  readonly informed_exit: {
    readonly initial_ship: { readonly position: V3; readonly velocity: V3 };
    readonly commands: readonly { readonly t: number; readonly delta_v: V3 }[];
  };
  readonly ring_crossing: {
    readonly closest_approaches: readonly {
      readonly rock: number;
      readonly t: number;
      readonly clearance_m: number;
      readonly center_distance_m: number;
      readonly ship_position: V3;
      readonly rock_position: V3;
    }[];
  };
}
interface S8Witness {
  readonly initial_rocks: {
    readonly positions: readonly V3[];
    readonly velocities: readonly V3[];
    readonly radii: readonly number[];
  };
  readonly snapshots: readonly {
    readonly t: number;
    readonly position: V3;
    readonly velocity: V3;
  }[];
}
const vectors = JSON.parse(rawVectors) as S8Vectors;
const witness = JSON.parse(rawWitness) as S8Witness;

// S8's world (`tools/studies/s8/core.py`, `inputs.json`) [FICTIONAL: P4, exponent 2.5].
const R0 = 1e6;
const GM_A = 1e10;
const GM_B = 2.5e9;
const D = 4e6;
const N = 2.5;
const OMEGA = Math.sqrt(((GM_A + GM_B) * Math.sqrt(R0)) / D ** 3.5);
const ALPHA_RADIUS = 2.5e5;
const BETA_RADIUS = 1.6e5;
/** S8's conservative sphere about the deployed hull. */
const HULL = 20;
/** "3σ" for three numbers at once. */
const CHI_3 = 3.763;

const A0: State6 = [-0.2 * D, 0, 0, 0, -0.2 * D * OMEGA, 0];
const B0: State6 = [0.8 * D, 0, 0, 0, 0.8 * D * OMEGA, 0];

interface Kick {
  readonly t: number;
  readonly dv: V3;
}
interface Truth {
  readonly A: V3;
  readonly B: V3;
  readonly ship: V3;
  readonly shipV: V3;
}

/**
 * A particle's truth from (t = 0, state) through velocity impulses, under the true law with both
 * bodies moving (they stay on S8's circular orbits). Gives the particle, Alpha and Beta.
 */
function truth(start: State6, kicks: readonly Kick[]): (times: readonly number[]) => Truth[] {
  const run = (t0: number, x: State6, bodies: readonly [State6, State6], times: number[]) => {
    const st: Structure = {
      r0: R0,
      n: N,
      bodies: [
        { id: 'A', mu: GM_A, state: bodies[0] },
        { id: 'B', mu: GM_B, state: bodies[1] },
      ],
      ship: x,
      dynamicBodies: true,
      engine: { kE: 1, dE: 0, dP: 0 },
      kA: 1,
      camBias: [0, 0, 0],
    };
    return simulate(
      compileArc(st, { id: 'truth', epoch: t0, commands: [] }, new Map()),
      [],
      times,
      15,
    );
  };
  const legs: { t0: number; x: State6; bodies: [State6, State6] }[] = [
    { t0: 0, x: start, bodies: [A0, B0] },
  ];
  for (const k of [...kicks].sort((a, b) => a.t - b.t)) {
    const last = legs[legs.length - 1]!;
    const tr = run(last.t0, last.x, last.bodies, [k.t]);
    const p = tr.pos[0]!;
    const v = tr.vel[0]!;
    legs.push({
      t0: k.t,
      x: [p[6]!, p[7]!, p[8]!, v[6]! + k.dv[0], v[7]! + k.dv[1], v[8]! + k.dv[2]],
      bodies: [
        [p[0]!, p[1]!, p[2]!, v[0]!, v[1]!, v[2]!],
        [p[3]!, p[4]!, p[5]!, v[3]!, v[4]!, v[5]!],
      ],
    });
  }
  return (times) => {
    const out = new Array<Truth>(times.length);
    legs.forEach((leg, j) => {
      const end = legs[j + 1]?.t0 ?? Infinity;
      const mine = times
        .map((t, i) => [t, i] as const)
        .filter(([t]) => t >= leg.t0 && (t < end || (j === legs.length - 1 && t >= leg.t0)))
        .sort((a, b) => a[0] - b[0]);
      if (mine.length === 0) return;
      const tr = run(
        leg.t0,
        leg.x,
        leg.bodies,
        mine.map((m) => m[0]),
      );
      mine.forEach(([, i], k) => {
        const p = tr.pos[k]!;
        const v = tr.vel[k]!;
        out[i] = {
          A: [p[0]!, p[1]!, p[2]!],
          B: [p[3]!, p[4]!, p[5]!],
          ship: [p[6]!, p[7]!, p[8]!],
          shipV: [v[6]!, v[7]!, v[8]!],
        };
      });
    });
    return out;
  };
}

const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const state = (p: V3, v: V3) => [...p, ...v] as unknown as State6;

describe('S8’s states, carried by the model’s own integrator under the true law', () => {
  const tol = vectors.tolerance;

  it('the wrong-law dive: S8’s truth samples to contact at 14,967 s', () => {
    const c = vectors.wrong_law.case;
    const at = truth(
      state(c.initial.position, c.initial.velocity),
      c.commands.map((k) => ({ t: k.t, dv: k.delta_v_vector })),
    );
    const ours = at(c.samples.map((s) => s.t));
    c.samples.forEach((s, i) => {
      expect(dist(ours[i]!.ship, s.position), `t=${s.t}`).toBeLessThan(tol.ship_position_m);
      expect(dist(ours[i]!.shipV, s.velocity), `t=${s.t}`).toBeLessThan(tol.ship_velocity_m_s);
      expect(Math.abs(dist(ours[i]!.ship, ours[i]!.A) - s.alpha_range)).toBeLessThan(
        tol.ship_position_m,
      );
    });
  });

  it('the informed exit: S8’s hourly snapshots to the ring crossing', () => {
    const e = vectors.informed_exit;
    const at = truth(
      state(e.initial_ship.position, e.initial_ship.velocity),
      e.commands.map((k) => ({ t: k.t, dv: k.delta_v })),
    );
    const snaps = witness.snapshots.filter((s) => s.t <= 90000);
    const ours = at(snaps.map((s) => s.t));
    snaps.forEach((s, i) => {
      expect(dist(ours[i]!.ship, s.position), `t=${s.t}`).toBeLessThan(tol.ship_position_m);
      expect(dist(ours[i]!.shipV, s.velocity), `t=${s.t}`).toBeLessThan(tol.ship_velocity_m_s);
    });
  });

  it('rock 140, from its initial state, passes the ship 11.18 km centre to centre at 88,214 s', () => {
    const e = vectors.informed_exit;
    const ca = vectors.ring_crossing.closest_approaches.find((q) => q.rock === 140)!;
    const r = witness.initial_rocks;
    const rock = truth(state(r.positions[140]!, r.velocities[140]!), [])([ca.t])[0]!;
    const ship = truth(
      state(e.initial_ship.position, e.initial_ship.velocity),
      e.commands.map((k) => ({ t: k.t, dv: k.delta_v })),
    )([ca.t])[0]!;
    expect(dist(rock.ship, ca.rock_position)).toBeLessThan(tol.ship_position_m);
    expect(dist(ship.ship, ca.ship_position)).toBeLessThan(tol.ship_position_m);
    expect(Math.abs(dist(rock.ship, ship.ship) - ca.center_distance_m)).toBeLessThan(
      tol.ship_position_m,
    );
  });
});

// ---------------------------------------------------------------------------------------------
// The model on S8's inputs
// ---------------------------------------------------------------------------------------------

const MASS = 30000;
/** A near-instant main engine, so a recorded burn is S8's velocity impulse to within metres. */
const THRUST = 1e6;
const massProperties: MassProperties = {
  mass: MASS,
  centerOfMass: { x: 0, y: 0, z: 0 },
  inertia: isotropicInertia(1e5),
  hull: prismHull(
    [
      { x: -8, y: -2.5 },
      { x: 8, y: -2.5 },
      { x: 8, y: 2.5 },
      { x: -8, y: 2.5 },
    ],
    -2.5,
    2.5,
  ),
};
const SIGMA_BEARING = 4.1e-5;
const RANGE_FRACTION = 2e-3;
const vec = (v: V3) => ({ x: v[0], y: v[1], z: v[2] });
const unit = (v: V3): V3 => {
  const n = Math.hypot(...v);
  return [v[0] / n, v[1] / n, v[2] / n];
};
/** The Gravity range's survey σ and priors (`src/content/gravity-range/briefing.ts`). */
const GRAVITY_RANGE_PRIORS: ParameterPrior[] = [
  { id: 'body.A.mu', label: 'Alpha μ', unit: 'm³/s²', value: 1.02e10, sigma: 3e8 },
  { id: 'body.B.mu', label: 'Beta μ', unit: 'm³/s²', value: 2.2e9, sigma: 8e8 },
];

function s8Context(
  start: State6,
  priors: ParameterPrior[] = GRAVITY_RANGE_PRIORS,
  asteroids: ModelContext['asteroids'] = [],
): ModelContext {
  const rng = createRng(808).stream('arrival');
  const p = (v: number, s: number) => v + rng.normal(0, s);
  return {
    encounterId: 'range',
    priors,
    bodies: [
      {
        id: 'A',
        name: 'Alpha',
        position: vec([A0[0], A0[1], A0[2]]),
        velocity: vec([A0[3], A0[4], A0[5]]),
        positionCov: isoCov3(0),
        radius: ALPHA_RADIUS,
        tracked: true,
      },
      {
        id: 'B',
        name: 'Beta',
        position: vec([B0[0], B0[1], B0[2]]),
        velocity: vec([B0[3], B0[4], B0[5]]),
        positionCov: isoCov3(5000),
        radius: BETA_RADIUS,
        tracked: true,
      },
    ],
    asteroids,
    ship: testShip(MASS, THRUST),
    arrival: {
      t: 0,
      position: { x: p(start[0], 1500), y: p(start[1], 1500), z: p(start[2], 1500) },
      velocity: { x: p(start[3], 0.15), y: p(start[4], 0.15), z: p(start[5], 0.15) },
      positionCov: isoCov3(1500),
      velocityCov: isoCov3(0.15),
      attitude: quat.IDENTITY,
      attitudeSigma: 4e-5,
      angularVelocity: { x: 0, y: 0, z: 0 },
    },
    settings: { dt: 60 },
  };
}

/**
 * What the ship records to `tEnd`: a camera fix on `target(t)` every `slot` seconds, the star
 * tracker's attitude at each change, and each impulse as a near-instant executed burn along it.
 */
function s8Record(
  ctx: ModelContext,
  at: (times: readonly number[]) => Truth[],
  tEnd: number,
  target: (t: number) => string | null,
  kicks: readonly Kick[],
  rocks: Readonly<Record<string, (times: readonly number[]) => Truth[]>> = {},
  slot = 120,
): AttemptRecord {
  const rng = createRng(808).stream('fixes');
  const times = Array.from({ length: Math.floor(tEnd / slot) + 1 }, (_, i) => i * slot);
  const tr = at(times);
  const rockAt = Object.fromEntries(Object.entries(rocks).map(([id, f]) => [id, f(times)]));
  const attitude = (t: number, q: quat.Quat): Measurement => {
    const phi = quat.toRotationVector(q);
    return {
      kind: 'attitude',
      t,
      source: 'st',
      value: [phi.x, phi.y, phi.z],
      sigma: [4e-5, 4e-5, 4e-5],
    };
  };
  const ms: Measurement[] = [attitude(0, quat.IDENTITY)];
  const executed: ExecutedCommand[] = [];
  for (const k of kicks) {
    const direction = vec(unit(k.dv));
    const q = quat.pointAlong(quat.IDENTITY, direction);
    const duration = (Math.hypot(...k.dv) * MASS) / THRUST;
    ms.push(attitude(k.t, q), attitude(k.t + duration, q));
    executed.push({
      t: k.t,
      command: {
        kind: 'burn',
        thruster: 'main',
        throttle: 1,
        duration,
        attitude: { reference: 'direction', direction },
      },
      source: 'plan',
      planId: `plan-${k.t}`,
      planItemId: 'burn',
      status: 'executed',
    });
  }
  times.forEach((t, k) => {
    const id = target(t);
    if (!id) return;
    const p = tr[k]!;
    const b = id === 'A' ? p.A : id === 'B' ? p.B : rockAt[id]![k]!.ship;
    const dx = b[0] - p.ship[0];
    const dy = b[1] - p.ship[1];
    const dz = b[2] - p.ship[2];
    const r = Math.hypot(dx, dy, dz);
    const az = Math.atan2(dy, dx) + rng.normal(0, SIGMA_BEARING);
    const el = Math.atan2(dz, Math.hypot(dx, dy)) + rng.normal(0, SIGMA_BEARING);
    ms.push({
      kind: 'bearing',
      t,
      source: 'cam',
      target: id,
      value: [az, el],
      sigma: [SIGMA_BEARING, SIGMA_BEARING],
    });
    ms.push({
      kind: 'range',
      t,
      source: 'cam',
      target: id,
      value: [r + rng.normal(0, RANGE_FRACTION * r)],
      sigma: [RANGE_FRACTION * r],
    });
  });
  ms.sort((a, b) => a.t - b.t);
  return {
    id: 'att1',
    index: 1,
    encounterId: 'range',
    startedAt: '2026-11-14T23:00:00Z',
    start: { estimate: ctx.arrival, configuration: 'radiators', modelVersion: 0 },
    plans: [],
    executed: executed.sort((a, b) => a.t - b.t),
    forecasts: [],
    measurements: ms,
    events: [],
    outcome: { kind: 'in-progress' },
    modelVersionAtEnd: 0,
  };
}

const upTo = (rec: AttemptRecord, t: number) => ({
  measurements: rec.measurements.filter((m) => m.t <= t),
  executed: rec.executed.filter((e) => e.t <= t),
});
const mat3 = (c: Cov3) =>
  fromRows([
    [c[0], c[1], c[2]],
    [c[1], c[3], c[4]],
    [c[2], c[4], c[5]],
  ]);
const track = (draft: ForecastDraft, id: string) =>
  draft.objects.find((o) => o.id === id)?.samples ?? [];
const pos = (p: { x: number; y: number; z: number }): V3 => [p.x, p.y, p.z];

/**
 * Worst Mahalanobis distance of truth from a forecast over its samples: the ship relative to the
 * forecast's reference body, and Beta relative to Alpha (every covariance is relative to the
 * reference body, which is Alpha throughout the dive).
 */
function honesty(draft: ForecastDraft, at: (times: readonly number[]) => Truth[]) {
  const tr = at(draft.samples.map((s) => s.t));
  const a = track(draft, 'A');
  const b = track(draft, 'B');
  let ship = 0;
  let beta = 0;
  draft.samples.forEach((s, i) => {
    const t = tr[i]!;
    const rel = (obj: V3, ref: V3, mo: V3, mr: V3) =>
      [0, 1, 2].map((c) => obj[c]! - ref[c]! - (mo[c]! - mr[c]!));
    ship = Math.max(
      ship,
      mahalanobis(rel(t.ship, t.A, pos(s.position), pos(a[i]!.position)), mat3(s.positionCov)),
    );
    beta = Math.max(
      beta,
      mahalanobis(rel(t.B, t.A, pos(b[i]!.position), pos(a[i]!.position)), mat3(b[i]!.positionCov)),
    );
  });
  return { ship, beta };
}

describe('S8’s wrong-law dive through the model (visibility and horizons)', () => {
  // Newtonian model, no rule; Beta never looked at. S8's 32 m/s retrograde dive at 600 s aims
  // for a 300 km periapsis under Newton and reaches Alpha's surface at 14,967 s.
  const c = vectors.wrong_law.case;
  const start = state(c.initial.position, c.initial.velocity);
  const kicks = c.commands.map((k) => ({ t: k.t, dv: k.delta_v_vector }));
  const at = truth(start, kicks);
  const ctx = s8Context(start);
  const full = s8Record(ctx, at, 15000, () => 'A', kicks);
  const burn = full.executed[0]!;
  const plan: Plan = {
    id: burn.planId!,
    epoch: burn.t,
    items: [{ id: 'burn', at: 0, command: burn.command }],
  };
  const svc = new ModelService(ctx);
  svc.load({ attempts: [] });
  svc.beginAttempt({ ...full, ...upTo(full, 600) });
  svc.refit();
  const commit = svc.forecast({
    id: 'commit',
    issuedAt: 600,
    plan,
    massProperties,
    step: 120,
    duration: 15400,
  });
  // Then fresh forecasts every 20 minutes from the fixes taken on the way down, each after a
  // refit, as the game loop does before a forecast.
  const fresh: { t: number; draft: ForecastDraft }[] = [];
  let last = 600;
  for (let t = 1800; t <= 13800; t += 1200) {
    const now = upTo(full, t);
    svc.append('att1', {
      measurements: now.measurements.filter((m) => m.t > last),
      executed: now.executed.filter((e) => e.t > last),
    });
    last = t;
    svc.refit();
    const { draft } = svc.forecast({
      id: `f${t}`,
      issuedAt: t,
      plan: { id: `coast-${t}`, epoch: t, items: [] },
      massProperties,
      step: 120,
      duration: 16000 - t,
    });
    fresh.push({ t, draft });
  }
  const clearance = (draft: ForecastDraft) => draft.closestApproaches.find((q) => q.id === 'A')!;

  it('the forecast frozen at commitment is honest and ends hours before contact', () => {
    expect(commit.detail.presentSource).toBe('arrival');
    expect(honesty(commit.draft, at).ship).toBeLessThan(CHI_3);
    // It never shows the periapsis the Newtonian aim promises: the line stops at 5,640 s.
    expect(commit.draft.horizon).toBeLessThan(c.hit_t - 2.5 * 3600);
  });

  it('every forecast on the way down is honest, Beta’s track included', () => {
    for (const { t, draft } of fresh) {
      const h = honesty(draft, at);
      expect(h.ship, `ship, issued ${t}`).toBeLessThan(CHI_3);
      expect(h.beta, `Beta, issued ${t}`).toBeLessThan(CHI_3);
    }
  });

  it('none claims a safe pass, and contact shows an hour ahead', () => {
    // A forecast whose line runs past the moment of contact cannot rule contact out.
    for (const { t, draft } of fresh) {
      const ca = clearance(draft);
      if (draft.horizon >= c.hit_t)
        expect(ca.distance - 3 * ca.sigma, `issued ${t}`).toBeLessThan(0);
    }
    const first = (ok: (ca: { distance: number; sigma: number }) => boolean) =>
      fresh.find((f) => ok(clearance(f.draft)))?.t ?? Infinity;
    // Contact inside 3σ from 11,400 s (3,570 s ahead), inside 1σ from 12,600 s (2,370 s), the
    // mean below the surface from 13,800 s (1,170 s). S8's position-error proxy: 4,977 s.
    expect(c.hit_t - first((ca) => ca.distance - 3 * ca.sigma <= 0)).toBeGreaterThan(3500);
    expect(c.hit_t - first((ca) => ca.distance - ca.sigma <= 0)).toBeGreaterThan(2300);
    expect(c.hit_t - first((ca) => ca.distance <= 0)).toBeGreaterThan(1100);
  });
}, 600_000);

describe('S8’s informed ring crossing through the model (tracked-rock uncertainty)', () => {
  // The law learned (the exponent rule adopted, masses known to 1%); Alpha tracked to 40,000 s,
  // then Beta, and from 76,000 s Beta and rock 140 alternately, a fix every 60 s. Forecast at
  // 85,200 s, 50 minutes before the closest approach.
  it('rock 140’s closest approach and its σ cover the true clearance of 6,385 m', () => {
    const e = vectors.informed_exit;
    const start = state(e.initial_ship.position, e.initial_ship.velocity);
    const kicks = e.commands.map((k) => ({ t: k.t, dv: k.delta_v }));
    const at = truth(start, kicks);
    const ca = vectors.ring_crossing.closest_approaches.find((q) => q.rock === 140)!;
    const r = witness.initial_rocks;
    const rockState = state(r.positions[140]!, r.velocities[140]!);
    const rock = truth(rockState, []);
    const rng = createRng(808).stream('rock');
    const ctx = s8Context(
      start,
      [
        { id: 'body.A.mu', label: 'Alpha μ', unit: 'm³/s²', value: 1e10, sigma: 2e7 },
        { id: 'body.B.mu', label: 'Beta μ', unit: 'm³/s²', value: 2.5e9, sigma: 2.5e7 },
        { id: 'law.gravity.exponent', label: 'n', unit: '', value: 2.5, sigma: 1e-3 },
      ],
      [
        {
          id: 'R140',
          position: {
            x: rockState[0] + rng.normal(0, 5000),
            y: rockState[1] + rng.normal(0, 5000),
            z: rockState[2] + rng.normal(0, 5000),
          },
          velocity: { x: rockState[3], y: rockState[4], z: rockState[5] },
          positionCov: isoCov3(5000),
          radius: r.radii[140]!,
          tracked: true,
        },
      ],
    );
    const tIssue = 85200;
    const target = (t: number): string | null => {
      if (t < 40000) return t % 120 === 0 ? 'A' : null;
      if (t < 76000) return t % 120 === 0 ? 'B' : null;
      return t % 120 === 0 ? 'B' : 'R140';
    };
    const svc = new ModelService(ctx);
    svc.load({ attempts: [], adopted: ['distance-law'] });
    svc.beginAttempt(s8Record(ctx, at, tIssue, target, kicks, { R140: rock }, 60));
    svc.refit();
    const { draft, detail } = svc.forecast({
      id: 'f',
      issuedAt: tIssue,
      plan: { id: 'coast', epoch: tIssue, items: [] },
      massProperties,
      step: 60,
      duration: 6000,
    });
    expect(detail.presentBody).toBe('B');
    expect(detail.asteroids.find((q) => q.id === 'R140')?.forecast).toBe(true);
    const got = draft.closestApproaches.find((q) => q.id === 'R140')!;
    expect(Math.abs(got.t - ca.t)).toBeLessThan(vectors.tolerance.event_time_s);
    // S8's clearance is to a 20 m sphere about the hull; ours to the hull's own reach.
    const reach = Math.hypot(8, 2.5, 2.5);
    const trueClearance = ca.clearance_m + HULL - reach;
    expect(Math.abs(got.distance - trueClearance) / got.sigma).toBeLessThan(3);
    // Informative: the pass is known to well under a kilometre (σ 647 m on a 6.5 km clearance).
    expect(got.sigma).toBeLessThan(1000);
  }, 300_000);
});
