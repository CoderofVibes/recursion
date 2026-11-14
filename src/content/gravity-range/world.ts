/**
 * TRUTH. The Gravity range as it really is at arrival (DECISIONS P16, P4, A3).
 *
 * Two bodies on a circular mutual orbit under the inverse-2.5 law, an asteroid field moving
 * under the same law, one distant sun, and the 1C ship on a circular orbit about Alpha at the
 * shared reference radius r0: the one distance where a Newtonian forecast calibrated on
 * arrival is exactly right.
 */

import type { ShipDefinition } from '../../contracts/ship.ts';
import type {
  Asteroid,
  GravityLaw,
  HiddenParameters,
  MassiveBody,
  Sun,
  TruthWorld,
} from '../../contracts/truth/index.ts';
import { createArrivalSystems } from '../../game/arrival.ts';
import { createRng } from '../../lib/rng.ts';
import { analytic, circularBinary, coupling } from '../../sim/index.ts';

/** [FICTIONAL] Brief §5: attraction falls with distance to the power 2.5. P4: one shared r0. */
export const LAW: GravityLaw = { exponent: 2.5, referenceRadius: 1_000_000 };

/** [ASSUMED] P16 (1B's candidate scale). GM in m³/s² at r0; radii are collision envelopes. */
export const ALPHA = { id: 'alpha', name: 'Alpha', gm: 1.0e10, radius: 250_000 } as const;
export const BETA = { id: 'beta', name: 'Beta', gm: 2.5e9, radius: 160_000 } as const;
export const SEPARATION = 4_000_000;

/**
 * [ASSUMED] One distant sun (A3). Direction 200° puts it behind the arriving ship as it looks
 * at Alpha, so both bodies are well lit on arrival and Alpha's shadow falls across the far side
 * of a low orbit. 600 W/m² is roughly sunlight at Mars; brightness is an owner content value
 * (P14 item 3).
 */
export const SUN: Sun = {
  direction: { x: Math.cos((200 * Math.PI) / 180), y: Math.sin((200 * Math.PI) / 180) },
  irradiance: 600,
};

/**
 * [ASSUMED] True hardware calibration the model has to find (parameter IDs: contracts README).
 * The engine runs 2.5% under its rating with the baseline's 3 mrad mount error; each IMU has a
 * fixed accelerometer bias within 1C's stated 5e-5 m/s².
 */
export const HIDDEN: HiddenParameters = {
  'thruster.main-engine.scale': 0.975,
  'thruster.main-engine.misalignment': 0.003,
  'sensor.imu-a.bias-x': 4e-5,
  'sensor.imu-a.bias-y': -2e-5,
  'sensor.imu-b.bias-x': -3e-5,
  'sensor.imu-b.bias-y': 1e-5,
};

/** Direction from Alpha to the arriving ship: the side away from Beta. */
export const ARRIVAL_ANGLE = Math.PI;

export function bodies(): readonly [MassiveBody, MassiveBody] {
  return circularBinary(LAW, ALPHA, BETA, SEPARATION).bodies;
}

const circularSpeedAbout = (gm: number, r: number): number =>
  analytic.circularSpeed(coupling(gm, LAW), LAW.exponent, r);

/** A test particle on a near-circular counter-clockwise orbit about `host`. */
function orbiting(
  id: string,
  host: MassiveBody,
  r: number,
  angle: number,
  speedFactor: number,
  radialFraction: number,
  radius: number,
): Asteroid {
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const vc = circularSpeedAbout(host.gm, r);
  const vt = vc * speedFactor;
  const vr = vc * radialFraction;
  return {
    id,
    radius,
    position: { x: host.position.x + r * ux, y: host.position.y + r * uy },
    velocity: {
      x: host.velocity.x + vr * ux - vt * uy,
      y: host.velocity.y + vr * uy + vt * ux,
    },
  };
}

/**
 * [ASSUMED] The asteroid field: test particles under the same law (brief §5).
 *
 * - 14 in a disc about Alpha between 580 and 960 km, on the route between the arrival orbit
 *   and the low orbit, all turning the same way as the ship;
 * - 2 on eccentric orbits that dip through the 450–550 km band;
 * - 4 about Beta.
 * Radii 0.4–3.5 km. Seeded, so every attempt meets the same field. `gravity-range.test.ts`
 * checks that none is lost to a body over the encounter and that the arrival orbit is clear.
 */
export function asteroids(seed: string, host: readonly [MassiveBody, MassiveBody]): Asteroid[] {
  const rng = createRng(seed).stream('content.asteroids');
  const [alpha, beta] = host;
  const field: Asteroid[] = [];
  const size = (): number => 400 * Math.pow(3500 / 400, rng.next());
  const name = (): string => `a-${String(field.length + 1).padStart(2, '0')}`;

  const disc = 14;
  for (let i = 0; i < disc; i++) {
    const r = 580_000 + ((960_000 - 580_000) * (i + rng.next())) / disc;
    field.push(
      orbiting(
        name(),
        alpha,
        r,
        rng.range(-Math.PI, Math.PI),
        1 + rng.range(-0.02, 0.02),
        rng.range(-0.015, 0.015),
        size(),
      ),
    );
  }
  // Launched from 700 km slower than circular, so they fall through the low-orbit band.
  for (let i = 0; i < 2; i++) {
    field.push(orbiting(name(), alpha, 700_000, rng.range(-Math.PI, Math.PI), 0.86, 0, size()));
  }
  for (let i = 0; i < 4; i++) {
    const r = 380_000 + (300_000 * (i + rng.next())) / 4;
    field.push(
      orbiting(
        name(),
        beta,
        r,
        rng.range(-Math.PI, Math.PI),
        1 + rng.range(-0.02, 0.02),
        0,
        size(),
      ),
    );
  }

  // Keep the arrival point clear: nothing within 60 km of where the ship appears.
  const ship = arrivalKinematics(alpha).position;
  return field.filter(
    (a) => Math.hypot(a.position.x - ship.x, a.position.y - ship.y) > 60_000 + a.radius,
  );
}

/** The ship's true arrival: circular about Alpha at r0, counter-clockwise, nose along its path. */
export function arrivalKinematics(alpha: MassiveBody): TruthWorld['ship']['kinematics'] {
  const r = LAW.referenceRadius;
  const ux = Math.cos(ARRIVAL_ANGLE);
  const uy = Math.sin(ARRIVAL_ANGLE);
  const v = circularSpeedAbout(alpha.gm, r);
  const velocity = { x: alpha.velocity.x - v * uy, y: alpha.velocity.y + v * ux };
  return {
    position: { x: alpha.position.x + r * ux, y: alpha.position.y + r * uy },
    velocity,
    attitude: Math.atan2(v * ux, -v * uy),
    angularRate: 0,
  };
}

/** The true world at arrival (t = 0). Recurrence resets to exactly this (P8). */
export function arrivalWorld(definition: ShipDefinition, seed: string): TruthWorld {
  const pair = bodies();
  return {
    t: 0,
    law: LAW,
    bodies: pair,
    asteroids: asteroids(seed, pair),
    ship: {
      kinematics: arrivalKinematics(pair[0]),
      systems: createArrivalSystems(definition, HIDDEN, seed),
    },
    fields: [],
    sun: SUN,
    hidden: HIDDEN,
  };
}
