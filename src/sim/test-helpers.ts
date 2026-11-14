/**
 * Small builders for sim tests (not exported from index.ts).
 */

import { mockShipSystemsState } from '../contracts/fixtures/truth.ts';
import type { MassProperties } from '../contracts/ship.ts';
import type {
  ActuatorOutput,
  Asteroid,
  GravityLaw,
  MassiveBody,
  ShipSystemsState,
  ThrustOutput,
  TruthWorld,
} from '../contracts/truth/index.ts';
import { createRng } from '../lib/rng.ts';
import type { Vec2 } from '../lib/vec2.ts';
import { circularBinary, circularSpeed } from './analytic.ts';
import { coupling } from './gravity.ts';

/** A 14 m × 4 m box hull centred on the datum, CoM at the datum. */
export const BOX_HULL: readonly Vec2[] = [
  { x: -7, y: -2 },
  { x: 7, y: -2 },
  { x: 7, y: 2 },
  { x: -7, y: 2 },
];

export function massProps(over: Partial<MassProperties> = {}): MassProperties {
  return {
    mass: 10_000,
    centerOfMass: { x: 0, y: 0 },
    inertia: 2.0e5,
    footprint: BOX_HULL,
    ...over,
  };
}

export function systemsWith(mp: MassProperties): ShipSystemsState {
  return { ...mockShipSystemsState, massProperties: mp };
}

export interface WorldSpec {
  law?: GravityLaw;
  bodies?: MassiveBody[];
  asteroids?: Asteroid[];
  position?: Vec2;
  velocity?: Vec2;
  attitude?: number;
  angularRate?: number;
  mp?: MassProperties;
  t?: number;
}

export function makeWorld(spec: WorldSpec = {}): TruthWorld {
  return {
    t: spec.t ?? 0,
    law: spec.law ?? { exponent: 2.5, referenceRadius: 1e6 },
    bodies: spec.bodies ?? [],
    asteroids: spec.asteroids ?? [],
    ship: {
      kinematics: {
        position: spec.position ?? { x: 0, y: 0 },
        velocity: spec.velocity ?? { x: 0, y: 0 },
        attitude: spec.attitude ?? 0,
        angularRate: spec.angularRate ?? 0,
      },
      systems: systemsWith(spec.mp ?? massProps()),
    },
    fields: [],
    hidden: {},
  };
}

export function body(
  id: string,
  gm: number,
  radius: number,
  position: Vec2,
  velocity: Vec2 = { x: 0, y: 0 },
  fixed = true,
): MassiveBody {
  return { id, name: id, gm, radius, position, velocity, fixed };
}

export function asteroid(id: string, position: Vec2, velocity: Vec2, radius: number): Asteroid {
  return { id, position, velocity, radius };
}

export function actuators(
  thrusts: ThrustOutput[],
  mp: MassProperties = massProps(),
  torque = 0,
): ActuatorOutput {
  return { thrusts, torque, massProperties: mp };
}

export const thrust = (point: Vec2, force: Vec2, source = 'main-engine'): ThrustOutput => ({
  source,
  point,
  force,
});

/**
 * The Gravity range candidate scale (DECISIONS P16, 1B §6): shared r0 = 1000 km, a circular
 * binary of GM 1e10 and 2.5e9 m³/s² at 4000 km, and `asteroidCount` asteroids on roughly
 * circular orbits about the primary. The ship starts 1000 km from the primary on a circle.
 */
export function gravityRangeWorld(asteroidCount = 0, seed = 'gravity-range-test'): TruthWorld {
  const law: GravityLaw = { exponent: 2.5, referenceRadius: 1e6 };
  const { bodies } = circularBinary(
    law,
    { id: 'alpha', name: 'Alpha', gm: 1e10, radius: 250e3 },
    { id: 'beta', name: 'Beta', gm: 2.5e9, radius: 160e3 },
    4e6,
  );
  const primary = bodies[0];
  const kPrimary = coupling(primary.gm, law);
  const rng = createRng(seed).stream('asteroids');
  const asteroids: Asteroid[] = [];
  for (let i = 0; i < asteroidCount; i++) {
    const r = rng.range(500e3, 1500e3);
    const phase = rng.range(0, 2 * Math.PI);
    const v = circularSpeed(kPrimary, law.exponent, r);
    asteroids.push({
      id: `a-${String(i + 1).padStart(2, '0')}`,
      position: {
        x: primary.position.x + r * Math.cos(phase),
        y: primary.position.y + r * Math.sin(phase),
      },
      velocity: {
        x: primary.velocity.x - v * Math.sin(phase),
        y: primary.velocity.y + v * Math.cos(phase),
      },
      radius: rng.range(20, 400),
    });
  }
  const rShip = 1e6;
  const vShip = circularSpeed(kPrimary, law.exponent, rShip);
  return makeWorld({
    law,
    bodies: [...bodies],
    asteroids,
    position: { x: primary.position.x, y: primary.position.y - rShip },
    velocity: { x: primary.velocity.x + vShip, y: primary.velocity.y },
    attitude: 0,
    mp: mockShipSystemsState.massProperties,
  });
}
