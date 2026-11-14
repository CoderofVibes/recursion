/**
 * Mock data generator for fixtures. [FICTIONAL] numbers chosen to look plausible.
 *
 * This is NOT the simulation (src/sim, section 2A) and NOT the estimator (2C). It uses a tiny
 * mock integrator so the fixtures hang together: the "measured" trail follows an inverse-2.5
 * world, the issued forecasts follow the ship's Newtonian model, and they visibly drift apart.
 *
 * It holds mock truth constants, so belief-side code must import ./index.ts, never this file.
 */

import { createRng, type Rng } from '../../lib/rng.ts';
import * as v from '../../lib/vec2.ts';
import type { Vec2 } from '../../lib/vec2.ts';

export const G0 = 9.80665;

export interface MockBody {
  readonly id: string;
  readonly name: string;
  /** Newtonian-equivalent GM at the reference radius, m³/s². */
  readonly mu: number;
  readonly radius: number;
  readonly position: Vec2;
}

export const MOCK_BODIES: readonly MockBody[] = [
  { id: 'alpha', name: 'Alpha', mu: 2.0e9, radius: 40e3, position: v.vec2(0, 0) },
  { id: 'beta', name: 'Beta', mu: 1.2e9, radius: 30e3, position: v.vec2(600e3, 0) },
];

export const TRUE_EXPONENT = 2.5;
export const TRUE_THRUST_SCALE = 0.97;
export const TRUE_IMU_BIAS_X = 1.2e-4;

export const ARRIVAL = {
  position: v.vec2(0, -150e3),
  velocity: v.vec2(Math.sqrt(2.0e9 / 150e3), 0),
  attitude: 0,
  mass: 11795,
} as const;

export const ENGINE = { thrust: 4000, isp: 320 } as const;

/** Reference radius per body: distance from the arrival point (DECISIONS P4 normalization). */
export const REFERENCE_RADIUS: Readonly<Record<string, number>> = Object.fromEntries(
  MOCK_BODIES.map((b) => [b.id, v.distance(ARRIVAL.position, b.position)]),
);

/** True coupling k = μ·r0^(n−2), so a = k / r^n equals μ / r0² at r0. */
export const trueCoupling = (b: MockBody): number =>
  b.mu * Math.pow(REFERENCE_RADIUS[b.id] as number, TRUE_EXPONENT - 2);

export interface GravityModel {
  readonly exponent: number;
  /** Coupling per body id. */
  readonly k: Readonly<Record<string, number>>;
}

export const TRUE_GRAVITY: GravityModel = {
  exponent: TRUE_EXPONENT,
  k: Object.fromEntries(MOCK_BODIES.map((b) => [b.id, trueCoupling(b)])),
};

export const newtonianGravity = (mu: Readonly<Record<string, number>>): GravityModel => ({
  exponent: 2,
  k: mu,
});

export function gravityAt(p: Vec2, g: GravityModel): Vec2 {
  let ax = 0;
  let ay = 0;
  for (const b of MOCK_BODIES) {
    const dx = b.position.x - p.x;
    const dy = b.position.y - p.y;
    const r = Math.hypot(dx, dy);
    const s = (g.k[b.id] ?? 0) / Math.pow(r, g.exponent + 1);
    ax += dx * s;
    ay += dy * s;
  }
  return { x: ax, y: ay };
}

export interface MockBurn {
  readonly start: number;
  readonly duration: number;
  /** 'prograde' or 'retrograde' along current velocity. */
  readonly direction: 'prograde' | 'retrograde';
}

export interface MockSample {
  readonly t: number;
  readonly position: Vec2;
  readonly velocity: Vec2;
  readonly mass: number;
  readonly attitude: number;
  /** Thrust acceleration along body +x this step, m/s² (0 when coasting). */
  readonly thrustAccel: number;
}

/** Velocity-Verlet with 1 s steps; thrust along the attitude, attitude follows velocity. */
export function propagate(
  g: GravityModel,
  burns: readonly MockBurn[],
  duration: number,
  thrustScale: number,
  dt = 1,
): MockSample[] {
  let p = ARRIVAL.position;
  let vel = ARRIVAL.velocity;
  let mass: number = ARRIVAL.mass;
  const out: MockSample[] = [];
  const mdot = ENGINE.thrust / (ENGINE.isp * G0);
  const thrustAt = (t: number, vNow: Vec2): { a: Vec2; along: number; att: number } => {
    const burn = burns.find((b) => t >= b.start && t < b.start + b.duration);
    const prograde = v.angleOf(vNow);
    if (!burn) return { a: v.ZERO, along: 0, att: prograde };
    const att = burn.direction === 'prograde' ? prograde : prograde + Math.PI;
    const along = (ENGINE.thrust * thrustScale) / mass;
    return { a: v.fromAngle(att, along), along, att };
  };
  let a = v.add(gravityAt(p, g), thrustAt(0, vel).a);
  for (let i = 0; i <= duration / dt; i++) {
    const t = i * dt;
    const th = thrustAt(t, vel);
    out.push({ t, position: p, velocity: vel, mass, attitude: th.att, thrustAccel: th.along });
    p = v.add(p, v.add(v.scale(vel, dt), v.scale(a, 0.5 * dt * dt)));
    if (th.along > 0) mass -= mdot * dt * thrustScale;
    const aNext = v.add(gravityAt(p, g), thrustAt(t + dt, vel).a);
    vel = v.addScaled(vel, v.add(a, aNext), 0.5 * dt);
    a = aNext;
  }
  return out;
}

/** Coast a test particle under a gravity model (positive or negative dt). */
export function coastParticle(
  p0: Vec2,
  v0: Vec2,
  g: GravityModel,
  duration: number,
  dt: number,
): { position: Vec2; velocity: Vec2 } {
  let p = p0;
  let vel = v0;
  let a = gravityAt(p, g);
  const n = Math.round(Math.abs(duration / dt));
  for (let i = 0; i < n; i++) {
    p = v.add(p, v.add(v.scale(vel, dt), v.scale(a, 0.5 * dt * dt)));
    const aNext = gravityAt(p, g);
    vel = v.addScaled(vel, v.add(a, aNext), 0.5 * dt);
    a = aNext;
  }
  return { position: p, velocity: vel };
}

export interface MockAsteroid {
  readonly id: string;
  readonly position: Vec2;
  readonly velocity: Vec2;
  readonly radius: number;
}

/** Asteroid field at t = 0, in a band around Alpha, on near-circular paths (true law). */
export function mockAsteroids(rng: Rng, count: number): MockAsteroid[] {
  const out: MockAsteroid[] = [];
  const alpha = MOCK_BODIES[0] as MockBody;
  for (let i = 0; i < count; i++) {
    const r = rng.range(125e3, 200e3);
    const theta = rng.range(-Math.PI, Math.PI);
    const pos = v.fromAngle(theta, r);
    const k = TRUE_GRAVITY.k[alpha.id] as number;
    const speed = Math.sqrt(k / Math.pow(r, TRUE_EXPONENT - 1)) * rng.range(0.97, 1.03);
    out.push({
      id: `a-${String(i + 1).padStart(2, '0')}`,
      position: pos,
      velocity: v.scale(v.perp(v.normalize(pos)), speed),
      radius: Math.round(rng.range(60, 600)),
    });
  }
  return out;
}

export const fixtureRng = (name: string): Rng => createRng('recursion-fixtures').stream(name);

export interface MockScenario {
  readonly asteroids: readonly MockAsteroid[];
  readonly burns: Readonly<Record<AttemptKey, readonly MockBurn[]>>;
  readonly durations: Readonly<Record<AttemptKey, number>>;
  readonly truth: Readonly<Record<AttemptKey, readonly MockSample[]>>;
}

export type AttemptKey = 'attempt-0001' | 'attempt-0002';

/**
 * The mock truth behind both attempts. Attempt 2's retrograde burn drops the ship toward
 * Alpha; asteroid a-07 is placed (by integrating backwards) so it meets the ship at 1500 s.
 */
export function buildMockScenario(): MockScenario {
  const burns = {
    'attempt-0001': [{ start: 300, duration: 20, direction: 'prograde' }],
    'attempt-0002': [{ start: 120, duration: 40, direction: 'retrograde' }],
  } as const satisfies Record<AttemptKey, readonly MockBurn[]>;
  const durations = { 'attempt-0001': 1800, 'attempt-0002': 1500 };
  const truth = {
    'attempt-0001': propagate(TRUE_GRAVITY, burns['attempt-0001'], 1800, TRUE_THRUST_SCALE),
    'attempt-0002': propagate(TRUE_GRAVITY, burns['attempt-0002'], 1500, TRUE_THRUST_SCALE),
  };
  const hit = truth['attempt-0002'][truth['attempt-0002'].length - 1] as MockSample;
  const side = v.perp(v.normalize(hit.velocity));
  const a07 = coastParticle(
    v.add(hit.position, v.scale(side, 300)),
    v.add(hit.velocity, v.scale(side, -25)),
    TRUE_GRAVITY,
    1500,
    -5,
  );
  const asteroids = mockAsteroids(fixtureRng('asteroids'), 14);
  asteroids[6] = { id: 'a-07', position: a07.position, velocity: a07.velocity, radius: 340 };
  return { asteroids, burns, durations, truth };
}
