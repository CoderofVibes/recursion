/**
 * S8's reference vectors (`tools/studies/s8/vectors.json` and the files it names), flown in this
 * game's own simulation. S8 wrote an independent RK4 integrator in Python with its own RNG; it
 * asks for its stored states and impulses to be used as they are, not its seeds
 * (`docs/handoffs/s8.md`). Rocks are massless, so the trajectories are flown with the bodies
 * alone, except the ring crossing, which needs S8's own rock states. Impulses are instantaneous
 * velocity changes, as in S8.
 *
 * Tolerances are S8's (`vectors.json` `tolerance`) unless a test says otherwise and why.
 */

import { describe, expect, it } from 'vitest';
import rawObjective from '../../../tools/studies/s8/objective.json?raw';
import rawRing from '../../../tools/studies/s8/ring-witness.json?raw';
import rawSeeds from '../../../tools/studies/s8/seeds.json?raw';
import rawVectors from '../../../tools/studies/s8/vectors.json?raw';
import type { Asteroid, TruthWorld } from '../../contracts/truth/index.ts';
import { evaluateObjectives, initialObjectiveProgress } from '../../game/objectives.ts';
import type { Vec3 } from '../../lib/vec3.ts';
import { createSimulation, type SimState } from '../../sim/index.ts';
import { arrivalKinematics } from './world.ts';
import { ARRIVAL_ANGLE, createGravityRange, GEOMETRIES } from './index.ts';

type Triple = readonly [number, number, number];
const vec = (t: Triple): Vec3 => ({ x: t[0], y: t[1], z: t[2] });
const V = JSON.parse(rawVectors) as {
  tolerance: {
    ship_position_m: number;
    ship_velocity_m_s: number;
    closest_clearance_m: number;
    event_time_s: number;
  };
  informed_exit: {
    initial_ship: { position: Triple; velocity: Triple };
    commands: { t: number; delta_v: Triple }[];
    expected: {
      beta_peri_m: number;
      beta_peri_t: number;
      exit_t: number;
      exit_speed: number;
      exit_position: Triple;
      exit_velocity: Triple;
    };
  };
  wrong_law: {
    case: {
      initial: { position: Triple; velocity: Triple };
      commands: { t: number; delta_v_vector: Triple }[];
      hit_t: number;
      warning_t: number;
      warning_position_error: number;
      samples: {
        t: number;
        position: Triple;
        velocity: Triple;
        forecast_position: Triple;
      }[];
    };
  };
  rejected_seed: { initial_ship: { position: Triple; velocity: Triple } };
  ring_crossing: {
    closest_approaches: {
      rock: number;
      t: number;
      center_distance_m: number;
    }[];
  };
};
const RING = JSON.parse(rawRing) as {
  initial_rocks: { positions: Triple[]; velocities: Triple[]; radii: number[] };
};
const SEEDS = JSON.parse(rawSeeds) as {
  catalogue: {
    candidates: {
      bearing_offset_deg: number;
      burn_time: number;
      main_delta_v: number;
      beta_peri_m: number;
      exit_t: number;
      exit_speed: number;
      robustness: {
        burn_time: number;
        main_delta_v: number;
        beta_peri_m: number;
        exit_t: number;
        exit_speed: number;
      }[];
    }[];
  };
  low_orbit: { first_burn_t: number; first_retrograde_delta_v: number; circularize_t: number };
  after_low_orbit: { selected: { burn_time: number; main_delta_v: number; exit_speed: number } };
};
const OBJECTIVE = JSON.parse(rawObjective) as {
  analytics: { nominal_arrival_C_m2_s2: number };
};
const TOL = V.tolerance;

const setup = createGravityRange();
const HOUR = 3600;

/** The arrival world, bodies only, the ship at S8's stored state. */
function world(position: Vec3, velocity: Vec3, asteroids: readonly Asteroid[] = []): TruthWorld {
  const w = setup.definition.world;
  return {
    ...w,
    asteroids,
    ship: { ...w.ship, kinematics: { ...w.ship.kinematics, position, velocity } },
  };
}

type Kick = { readonly t: number; readonly dv: Vec3 | number };

/** Add a velocity change: a vector, or a speed change along the velocity relative to Alpha. */
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

/**
 * Fly from `start`, applying the kicks at their times, sampling every second. `watch` sees every
 * state; returns the state at `until`.
 */
function fly(
  start: TruthWorld,
  kicks: readonly Kick[],
  until: number,
  watch: (s: SimState) => void = () => undefined,
): SimState {
  const sim = createSimulation(start, { dt: 1 });
  let state: SimState = sim.initial;
  const pending = [...kicks].sort((a, b) => a.t - b.t);
  while (state.world.t < until) {
    while (pending.length > 0 && pending[0]!.t <= state.world.t)
      state = kick(state, pending.shift()!.dv);
    const next = Math.min(pending[0]?.t ?? Infinity, until);
    state = sim.run(state, next - state.world.t, { sampleEvery: 1, onSample: watch }).state;
  }
  return state;
}

const dist = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/**
 * Closest approach to Beta (sampled each second), when the ship first passes 9,000 km from the
 * barycentre, and its state at `epoch` (S8 compares states at its own stored sample epochs).
 */
function passAndExit(start: TruthWorld, kicks: readonly Kick[], epoch: number) {
  let peri = Infinity;
  let periT = 0;
  let crossed: number | undefined;
  let exit: { t: number; speed: number; position: Vec3; velocity: Vec3 } | undefined;
  fly(start, kicks, epoch, (s) => {
    const [a, b] = s.world.bodies;
    const k = s.world.ship.kinematics;
    const d = dist(k.position, b!.position);
    if (d < peri) {
      peri = d;
      periT = s.world.t;
    }
    // The barycentre of the pair (S8's frame starts at rest there and stays there).
    const m = a!.gm + b!.gm;
    const c = {
      x: (a!.gm * a!.position.x + b!.gm * b!.position.x) / m,
      y: (a!.gm * a!.position.y + b!.gm * b!.position.y) / m,
      z: (a!.gm * a!.position.z + b!.gm * b!.position.z) / m,
    };
    if (crossed === undefined && dist(k.position, c) > 9_000_000) crossed = s.world.t;
    if (s.world.t === epoch)
      exit = {
        t: s.world.t,
        speed: Math.hypot(k.velocity.x, k.velocity.y, k.velocity.z),
        position: k.position,
        velocity: k.velocity,
      };
  });
  return { peri, periT, crossed, exit };
}

describe('S8 reference vectors in the game’s simulation', () => {
  it('the arrival is S8’s: position, velocity and Jacobi constant', () => {
    const k = setup.definition.world.ship.kinematics;
    const s = V.informed_exit.initial_ship;
    expect(dist(k.position, vec(s.position))).toBeLessThan(1e-6);
    expect(dist(k.velocity, vec(s.velocity))).toBeLessThan(1e-9);
    // The Jacobi constant is checked in src/game/depart.test.ts against the same 5,826.649.
    expect(OBJECTIVE.analytics.nominal_arrival_C_m2_s2).toBeCloseTo(5826.649268, 5);
  });

  it(
    'the informed exit: the pass, the lift and the exit state, within S8’s tolerances',
    { timeout: 120_000 },
    () => {
      const v = V.informed_exit;
      const e = v.expected;
      const run = passAndExit(
        world(vec(v.initial_ship.position), vec(v.initial_ship.velocity)),
        v.commands.map((c) => ({ t: c.t, dv: vec(c.delta_v) })),
        e.exit_t,
      );
      // S8 samples every 60 s here: the closest approach is its sampled minimum, and its exit
      // the first sample past 9,000 km.
      expect(Math.abs(run.peri - e.beta_peri_m)).toBeLessThan(TOL.closest_clearance_m);
      expect(Math.abs(run.periT - e.beta_peri_t)).toBeLessThan(TOL.event_time_s);
      expect(run.crossed).toBeGreaterThan(e.exit_t - 60);
      expect(run.crossed).toBeLessThanOrEqual(e.exit_t);
      expect(dist(run.exit!.position, vec(e.exit_position))).toBeLessThan(TOL.ship_position_m);
      expect(dist(run.exit!.velocity, vec(e.exit_velocity))).toBeLessThan(TOL.ship_velocity_m_s);
      expect(Math.abs(run.exit!.speed - e.exit_speed)).toBeLessThan(TOL.ship_velocity_m_s);
    },
  );

  it(
    'the ring crossing: S8’s rocks, closest approaches within its tolerances',
    { timeout: 300_000 },
    () => {
      const v = V.informed_exit;
      const rocks: Asteroid[] = RING.initial_rocks.positions.map((p, i) => ({
        id: `s8-${i}`,
        position: vec(p),
        velocity: vec(RING.initial_rocks.velocities[i]!),
        radius: RING.initial_rocks.radii[i]!,
      }));
      const watched = new Map(V.ring_crossing.closest_approaches.map((c) => [`s8-${c.rock}`, c]));
      const closest = new Map<string, { d: number; t: number }>();
      fly(
        world(vec(v.initial_ship.position), vec(v.initial_ship.velocity), rocks),
        v.commands.map((c) => ({ t: c.t, dv: vec(c.delta_v) })),
        v.expected.exit_t,
        (s) => {
          const p = s.world.ship.kinematics.position;
          for (const rock of s.world.asteroids) {
            if (!watched.has(rock.id)) continue;
            const d = dist(p, rock.position);
            const best = closest.get(rock.id);
            if (!best || d < best.d) closest.set(rock.id, { d, t: s.world.t });
          }
        },
      );
      expect(watched.size).toBe(8);
      for (const [id, c] of watched) {
        const ours = closest.get(id)!;
        expect(Math.abs(ours.d - c.center_distance_m), id).toBeLessThan(TOL.closest_clearance_m);
        expect(Math.abs(ours.t - c.t), id).toBeLessThan(TOL.event_time_s);
      }
    },
  );

  it('the wrong-law dive: the true path, the contact, and a 10 km miss well before it', () => {
    const w = V.wrong_law.case;
    const samples = new Map(w.samples.map((s) => [s.t, s]));
    let contact = Infinity;
    let before: { t: number; r: number } | undefined;
    fly(
      world(vec(w.initial.position), vec(w.initial.velocity)),
      w.commands.map((c) => ({ t: c.t, dv: vec(c.delta_v_vector) })),
      Math.ceil(w.hit_t) + 1,
      (s) => {
        const k = s.world.ship.kinematics;
        const r = dist(k.position, s.world.bodies[0]!.position);
        // S8's contact: the centre of mass at Alpha's radius plus a 20 m ship sphere.
        if (before && before.r > 250_020 && r <= 250_020 && contact === Infinity)
          contact = before.t + (before.r - 250_020) / (before.r - r);
        before = { t: s.world.t, r };
        const sample = samples.get(s.world.t);
        // S8 stores the state just after an impulse; ours at that epoch is just before it.
        if (!sample || s.world.t > w.hit_t || w.commands.some((c) => c.t === s.world.t)) return;
        expect(dist(k.position, vec(sample.position)), `t ${s.world.t}`).toBeLessThan(
          TOL.ship_position_m,
        );
        expect(dist(k.velocity, vec(sample.velocity)), `t ${s.world.t}`).toBeLessThan(
          TOL.ship_velocity_m_s,
        );
      },
    );
    // S8 refines contact by bisection; ours interpolates between one-second samples.
    expect(Math.abs(contact - w.hit_t)).toBeLessThan(0.5);
    // S8's frozen Newtonian forecast is 10.01 km off the truth 4,977 s before contact.
    const warning = samples.get(w.warning_t)!;
    expect(dist(vec(warning.position), vec(warning.forecast_position))).toBeCloseTo(
      w.warning_position_error,
      3,
    );
    expect(w.hit_t - w.warning_t).toBeGreaterThan(4_900);
  });

  it('the rejected seed (+25°) is the game’s own arrival at that offset, and is not in the catalogue', () => {
    const alpha = setup.definition.world.bodies[0]!;
    const k = arrivalKinematics(alpha, ARRIVAL_ANGLE + (25 * Math.PI) / 180);
    const s = V.rejected_seed.initial_ship;
    expect(dist(k.position, vec(s.position))).toBeLessThan(1e-6);
    expect(dist(k.velocity, vec(s.velocity))).toBeLessThan(1e-9);
    expect(GEOMETRIES.map((g) => Math.round((g.offset * 180) / Math.PI))).toEqual([
      -15, -10, -5, 0, 5, 10, 15,
    ]);
  });

  it(
    'every catalogue geometry: S8’s route and its nine perturbed controls reach the gate here too',
    { timeout: 300_000 },
    () => {
      const alpha = setup.definition.world.bodies[0]!;
      for (const g of GEOMETRIES) {
        const offset = Math.round((g.offset * 180) / Math.PI);
        const candidate = SEEDS.catalogue.candidates.find((c) => c.bearing_offset_deg === offset)!;
        expect(candidate.burn_time).toBe(g.route.burnAt);
        expect(candidate.main_delta_v).toBeCloseTo(g.route.deltaV, 9);
        const k = arrivalKinematics(alpha, ARRIVAL_ANGLE + g.offset);
        for (const control of [candidate, ...candidate.robustness]) {
          const run = passAndExit(
            world(k.position, k.velocity),
            [{ t: control.burn_time, dv: control.main_delta_v }],
            control.exit_t,
          );
          const label = `${g.id} ${control.burn_time} s ${control.main_delta_v} m/s`;
          expect(Math.abs(run.peri - control.beta_peri_m), label).toBeLessThan(
            TOL.closest_clearance_m,
          );
          // The crossing is an event: S8's event-time tolerance (its search samples coarsely).
          expect(Math.abs(run.crossed! - control.exit_t), label).toBeLessThan(TOL.event_time_s);
          expect(Math.abs(run.exit!.speed - control.exit_speed), label).toBeLessThan(
            TOL.ship_velocity_m_s,
          );
          expect(run.exit!.speed, label).toBeGreaterThan(50);
        }
      }
    },
  );

  it(
    'low orbit, then the slingshot: rejected by the old cap, reached now that learning is free (A18 (3))',
    { timeout: 120_000 },
    () => {
      // S8 seeds.json: dive 9.85 m/s, circularise near 494 km, one turn, then 23 m/s prograde
      // (`after_low_orbit.selected`). 45.2 m/s in all, over the old 16 m/s cap. Each burn is
      // flown as a finite burn, in one-second pieces of at most 0.8 m/s (the main engine's
      // rate), because only the part of a burn after the ship could leave Alpha's lobe counts.
      const lo = SEEDS.low_orbit;
      const after = SEEDS.after_low_orbit.selected;
      const burns: [number, number][] = [
        [lo.first_burn_t, -lo.first_retrograde_delta_v],
        [lo.circularize_t, -12.347686559630828],
        [after.burn_time, after.main_delta_v],
      ];
      const kicks: Kick[] = [];
      for (const [t, dv] of burns) {
        const n = Math.ceil(Math.abs(dv) / 0.8);
        for (let i = 0; i < n; i++) kicks.push({ t: t + i, dv: dv / n });
      }
      let progress = initialObjectiveProgress;
      let lastT = 0;
      const spentBetween = (t0: number, t1: number) =>
        kicks
          .filter((k) => k.t >= t0 && k.t < t1)
          .reduce((s, k) => s + Math.abs(k.dv as number), 0);
      fly(
        world(
          setup.definition.world.ship.kinematics.position,
          setup.definition.world.ship.kinematics.velocity,
        ),
        kicks,
        100 * HOUR,
        (s) => {
          if (progress.completed || s.world.t % 30 !== 0) return;
          progress = evaluateObjectives(
            setup.objectiveRules,
            progress,
            s.world,
            spentBetween(lastT, s.world.t),
          ).progress;
          lastT = s.world.t;
        },
      );
      expect(progress.completed).toBe('depart');
      expect(progress.deltaV).toBeCloseTo(45.2, 1);
      // Only what was spent after the lobe opened counts: a few m/s of the 23 m/s burn.
      expect(progress.counted).toBeGreaterThan(3);
      expect(progress.counted).toBeLessThan(8);
      expect(progress.assists?.beta?.best).toBeGreaterThan(2_000);
    },
  );
});
