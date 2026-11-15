/**
 * S21's reference vectors (`tools/studies/s21/vectors.json`, `passes.json`, `catalogue.json`)
 * flown in this game's own simulation with this game's crescent (`clouds.ts`). S21 extends S8's
 * RK4 integrator; its states and impulses are used as they are, not its seeds. Impulses are
 * instantaneous velocity changes ("delivered inertial velocity", S21), the main one along the
 * velocity relative to Alpha. Tolerances are S21's (`vectors.json` `tolerances`) unless a test
 * says otherwise and why.
 *
 * The cloud integrals are taken at the centre of mass, as S21's are ("COM reference values");
 * the game samples every equipment item, which the truth-step tests cover.
 */

import { describe, expect, it } from 'vitest';
import rawCatalogue from '../../../tools/studies/s21/catalogue.json?raw';
import rawPasses from '../../../tools/studies/s21/passes.json?raw';
import rawVectors from '../../../tools/studies/s21/vectors.json?raw';
import type { Asteroid, TruthWorld } from '../../contracts/truth/index.ts';
import type { Vec3 } from '../../lib/vec3.ts';
import { createSimulation, type SimState } from '../../sim/index.ts';
import { binaryAxes, crescentIntensity } from './clouds.ts';
import { arrivalKinematics } from './world.ts';
import { createGravityRange, GEOMETRIES } from './index.ts';

type Triple = readonly [number, number, number];
const vec = (t: Triple): Vec3 => ({ x: t[0], y: t[1], z: t[2] });

interface Summary {
  readonly beta_peri_m: number;
  readonly beta_peri_t: number;
  readonly exit_t: number;
  readonly exit_speed: number;
  readonly exit_position: Triple;
  readonly exit_velocity: Triple;
  readonly qualifies: boolean;
}
interface Cloud {
  readonly raw_exposure: number;
  readonly caution_t: number | null;
}
interface Vector {
  readonly initial_ship: { position: Triple; velocity: Triple };
  readonly commands: readonly {
    t: number;
    kind: 'impulse';
    frame: 'alpha-relative-prograde' | 'inertial';
    delta_v: number | Triple;
  }[];
  readonly summary: Summary;
  readonly expectations: {
    readonly clearance?: { clearance_m: number; closest_t: number; rock: number };
    readonly cloud?: Cloud;
  };
  readonly samples: readonly { t: number; position: Triple; velocity: Triple }[];
}
const V = JSON.parse(rawVectors) as {
  law: { gm: [number, number]; separation: number; radii: [number, number] };
  rock_fixture: { positions: Triple[]; velocities: Triple[]; radii: number[] };
  hull_enclosing_radius: number;
  vectors: Record<'informed-belt-thread' | 'outside-gate-failure' | 'power-death', Vector>;
  tolerances: {
    same_epoch_position_m: number;
    same_epoch_velocity_m_s: number;
    sampled_gate_time_s: number;
    rock_clearance_m: number;
  };
};
const PASSES = JSON.parse(rawPasses) as { burn_m_s: number; summary: Summary; cloud: Cloud }[];
const CATALOGUE = JSON.parse(rawCatalogue) as {
  offset_deg: number;
  main_dv: number;
  burn_t: number;
  lift_t: number;
  summary: Summary;
  cloud: Cloud;
}[];
const TOL = V.tolerances;
const setup = createGravityRange();

function world(position: Vec3, velocity: Vec3, asteroids: readonly Asteroid[] = []): TruthWorld {
  const w = setup.definition.world;
  return {
    ...w,
    asteroids,
    ship: { ...w.ship, kinematics: { ...w.ship.kinematics, position, velocity } },
  };
}

type Kick = { readonly t: number; readonly dv: Vec3 | number };

function kick(state: SimState, dv: Vec3 | number): SimState {
  const k = state.world.ship.kinematics;
  let d: Vec3;
  if (typeof dv === 'number') {
    const a = state.world.bodies[0]!.velocity;
    const rel = { x: k.velocity.x - a.x, y: k.velocity.y - a.y, z: k.velocity.z - a.z };
    const s = Math.hypot(rel.x, rel.y, rel.z);
    d = { x: (dv * rel.x) / s, y: (dv * rel.y) / s, z: (dv * rel.z) / s };
  } else d = dv;
  return {
    ...state,
    world: {
      ...state.world,
      ship: {
        ...state.world.ship,
        kinematics: {
          ...k,
          velocity: { x: k.velocity.x + d.x, y: k.velocity.y + d.y, z: k.velocity.z + d.z },
        },
      },
    },
  };
}

const kicksOf = (v: Vector): Kick[] =>
  v.commands.map((c) => ({
    t: c.t,
    dv: typeof c.delta_v === 'number' ? c.delta_v : vec(c.delta_v),
  }));

const dist = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/**
 * Fly from `start` with the kicks, every second, to `until` or the first outward 9,000 km
 * crossing (`stopAtExit`). Integrates the crescent's intensity at the centre of mass, and keeps
 * Beta's closest approach, the exit, and the states at `epochs`.
 */
function flight(
  start: TruthWorld,
  kicks: readonly Kick[],
  until: number,
  options: { stopAtExit?: boolean; epochs?: ReadonlySet<number> } = {},
) {
  const sim = createSimulation(start, { dt: 1 });
  let state: SimState = sim.initial;
  const pending = [...kicks].sort((a, b) => a.t - b.t);
  let peri = Infinity;
  let periT = 0;
  let exposure = 0;
  let cautionAt: number | undefined;
  let exit: { t: number; speed: number } | undefined;
  const at = new Map<number, { position: Vec3; velocity: Vec3 }>();
  let lastIntensity = 0;
  const watch = (s: SimState) => {
    const [a, b] = s.world.bodies;
    const k = s.world.ship.kinematics;
    const d = dist(k.position, b!.position);
    if (d < peri) {
      peri = d;
      periT = s.world.t;
    }
    // Trapezoid over the second just flown.
    const i = crescentIntensity(k.position, binaryAxes(s.world));
    if (s.world.t > 0) exposure += 0.5 * (i + lastIntensity);
    lastIntensity = i;
    if (cautionAt === undefined && exposure >= 1) cautionAt = s.world.t;
    const m = a!.gm + b!.gm;
    const c = {
      x: (a!.gm * a!.position.x + b!.gm * b!.position.x) / m,
      y: (a!.gm * a!.position.y + b!.gm * b!.position.y) / m,
      z: (a!.gm * a!.position.z + b!.gm * b!.position.z) / m,
    };
    if (exit === undefined && dist(k.position, c) > 9_000_000)
      exit = { t: s.world.t, speed: Math.hypot(k.velocity.x, k.velocity.y, k.velocity.z) };
    if (options.epochs?.has(s.world.t))
      at.set(s.world.t, { position: k.position, velocity: k.velocity });
  };
  watch(state);
  while (state.world.t < until && !(options.stopAtExit && exit)) {
    while (pending.length > 0 && pending[0]!.t <= state.world.t)
      state = kick(state, pending.shift()!.dv);
    const stop = Math.min(pending[0]?.t ?? Infinity, until);
    // In chunks, so a stop at the exit does not fly on for days.
    const steps = Math.min(stop - state.world.t, options.stopAtExit ? 3600 : Infinity);
    state = sim.run(state, steps, { sampleEvery: 1, onSample: watch }).state;
  }
  return { peri, periT, exposure, cautionAt, exit, at, state };
}

describe('S21 reference vectors in the game’s simulation', () => {
  it('the fixture is the game’s law and bodies, and its arrival is the game’s', () => {
    const w = setup.definition.world;
    expect(w.bodies.map((b) => b.gm)).toEqual(V.law.gm);
    expect(w.bodies.map((b) => b.radius)).toEqual(V.law.radii);
    expect(dist(w.bodies[0]!.position, w.bodies[1]!.position)).toBeCloseTo(V.law.separation, 3);
    const s = V.vectors['informed-belt-thread'].initial_ship;
    expect(dist(w.ship.kinematics.position, vec(s.position))).toBeLessThan(1e-6);
    expect(dist(w.ship.kinematics.velocity, vec(s.velocity))).toBeLessThan(1e-9);
  });

  it(
    'the informed belt thread: through S21’s rocks at 830 km, clear of the clouds, out at 63.8 m/s',
    { timeout: 180_000 },
    () => {
      const v = V.vectors['informed-belt-thread'];
      const r = V.rock_fixture;
      // S21's 336 rocks, as asteroids of this simulation (massless; they move under the bodies).
      const rocks: Asteroid[] = r.positions.map((p, i) => ({
        id: `s21-${i}`,
        position: vec(p),
        velocity: vec(r.velocities[i]!),
        radius: r.radii[i]!,
      }));
      const epochs = new Set(
        v.samples.map((s) => s.t).filter((t) => !v.commands.some((c) => c.t === t)),
      );
      const sim = createSimulation(
        world(vec(v.initial_ship.position), vec(v.initial_ship.velocity), rocks),
        {
          dt: 1,
        },
      );
      // Closest rock, surface to a 20 m sphere about the ship, over the whole flight.
      let clearance = Infinity;
      let closest = -1;
      let state = sim.initial;
      const kicks = kicksOf(v);
      const until = v.summary.exit_t;
      const watch = (s: SimState) => {
        const k = s.world.ship.kinematics.position;
        for (const a of s.world.asteroids) {
          const gap = dist(k, a.position) - a.radius - V.hull_enclosing_radius;
          if (gap < clearance) {
            clearance = gap;
            closest = Number(a.id.slice(4));
          }
        }
      };
      while (state.world.t < until) {
        while (kicks.length > 0 && kicks[0]!.t <= state.world.t)
          state = kick(state, kicks.shift()!.dv);
        const stop = Math.min(kicks[0]?.t ?? Infinity, until);
        state = sim.run(state, stop - state.world.t, { sampleEvery: 1, onSample: watch }).state;
      }
      const c = v.expectations.clearance!;
      expect(closest).toBe(c.rock);
      // S21 sweeps continuously between its 120 s samples; this samples every second.
      expect(Math.abs(clearance - c.clearance_m)).toBeLessThan(TOL.rock_clearance_m);
      // The same flight without rocks for the states, the pass, the exit and the clouds.
      const f = flight(
        world(vec(v.initial_ship.position), vec(v.initial_ship.velocity)),
        kicksOf(v),
        until,
        {
          epochs,
        },
      );
      for (const s of v.samples) {
        const got = f.at.get(s.t);
        if (!got) continue;
        expect(dist(got.position, vec(s.position))).toBeLessThan(TOL.same_epoch_position_m);
        expect(dist(got.velocity, vec(s.velocity))).toBeLessThan(TOL.same_epoch_velocity_m_s);
      }
      expect(Math.abs(f.peri - v.summary.beta_peri_m)).toBeLessThan(1_000);
      expect(Math.abs(f.exit!.t - v.summary.exit_t)).toBeLessThanOrEqual(TOL.sampled_gate_time_s);
      expect(f.exit!.speed).toBeGreaterThan(50);
      expect(Math.abs(f.exit!.speed - v.summary.exit_speed)).toBeLessThan(0.05);
      expect(f.exposure).toBe(0);
    },
  );

  it(
    'the outside gate: 16 m/s round the far side of Beta leaves at 38.9 m/s, short of 50',
    { timeout: 120_000 },
    () => {
      const v = V.vectors['outside-gate-failure'];
      const f = flight(
        world(vec(v.initial_ship.position), vec(v.initial_ship.velocity)),
        kicksOf(v),
        300_000,
        {
          stopAtExit: true,
        },
      );
      expect(Math.abs(f.exit!.t - v.summary.exit_t)).toBeLessThanOrEqual(TOL.sampled_gate_time_s);
      expect(f.exit!.speed).toBeCloseTo(v.summary.exit_speed, 1);
      expect(f.exit!.speed).toBeLessThan(50);
      expect(Math.abs(f.peri - v.summary.beta_peri_m)).toBeLessThan(1_000);
      expect(f.exposure).toBe(0);
    },
  );

  it.each(PASSES.map((p) => [Math.round(p.summary.beta_peri_m / 1000), p] as const))(
    'S21’s pass table: the %i km pass meets the clouds as S21 found',
    { timeout: 120_000 },
    (_km, p) => {
      const k = setup.definition.world.ship.kinematics;
      const f = flight(world(k.position, k.velocity), [{ t: 3_960, dv: p.burn_m_s }], 400_000, {
        stopAtExit: true,
      });
      expect(Math.abs(f.peri - p.summary.beta_peri_m)).toBeLessThan(1_000);
      // S21 integrates at 120 s with RK4 and converges to a few parts in 10⁴ (verification.json).
      if (p.cloud.raw_exposure === 0) expect(f.exposure).toBe(0);
      else expect(Math.abs(f.exposure / p.cloud.raw_exposure - 1)).toBeLessThan(0.01);
      if (p.cloud.caution_t === null) expect(f.cautionAt).toBeUndefined();
      else expect(Math.abs(f.cautionAt! - p.cloud.caution_t)).toBeLessThan(TOL.sampled_gate_time_s);
    },
  );

  it.each(GEOMETRIES.map((g) => [g.id, g] as const))(
    'catalogue %s: S21’s adapted 830 km route is the geometry’s, and meets no cloud',
    { timeout: 120_000 },
    (_id, g) => {
      const c = CATALOGUE.find((e) => Math.abs((e.offset_deg * Math.PI) / 180 - g.offset) < 1e-9)!;
      expect(g.route).toMatchObject({ burnAt: c.burn_t, liftAt: c.lift_t });
      expect(g.route.deltaV).toBeCloseTo(c.main_dv, 9);
      const k = arrivalKinematics(setup.definition.world.bodies[0]!, Math.PI + g.offset);
      const f = flight(
        world(k.position, k.velocity),
        [
          { t: c.burn_t, dv: c.main_dv },
          { t: c.lift_t, dv: { x: 0, y: 0, z: g.route.lift } },
        ],
        400_000,
        { stopAtExit: true },
      );
      expect(Math.abs(f.peri - c.summary.beta_peri_m)).toBeLessThan(1_000);
      expect(Math.abs(f.exit!.t - c.summary.exit_t)).toBeLessThanOrEqual(TOL.sampled_gate_time_s);
      expect(Math.abs(f.exit!.speed - c.summary.exit_speed)).toBeLessThan(0.05);
      expect(f.exposure).toBe(0);
    },
  );
});
