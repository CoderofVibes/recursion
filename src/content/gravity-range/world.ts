/**
 * TRUTH. The Gravity range as it really is at arrival (DECISIONS P16, P4, A3, A6, A11).
 *
 * Two bodies on a circular mutual orbit under the inverse-2.5 law, an asteroid field about
 * Alpha and a ring of rocks about Beta moving under the same law, one distant sun, and the 1C
 * ship on a circular orbit about Alpha at the shared reference radius r0: the one distance
 * where a Newtonian forecast calibrated on arrival is exactly right.
 *
 * Three dimensions (A11). The binary's orbit is the inertial x–y plane and the ship arrives in
 * it, so the slingshot past Beta keeps the numbers of 2F's study. What is out of that plane:
 * Alpha's asteroids (orbits tilted up to 6°), the ring's thickness, and the sun (12° above).
 * The ship leaves the plane when the player flies it out, for example to cross above the ring.
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
import { fromAxisAngle, fromYaw, rotate } from '../../lib/quat.ts';
import { createRng } from '../../lib/rng.ts';
import { add, distance, fromAzEl, scale } from '../../lib/vec3.ts';
import { analytic, circularBinary, coupling } from '../../sim/index.ts';

/** [FICTIONAL] Brief §5: attraction falls with distance to the power 2.5. P4: one shared r0. */
export const LAW: GravityLaw = { exponent: 2.5, referenceRadius: 1_000_000 };

/** [ASSUMED] P16 (1B's candidate scale). GM in m³/s² at r0; radii are collision envelopes. */
export const ALPHA = { id: 'alpha', name: 'Alpha', gm: 1.0e10, radius: 250_000 } as const;
export const BETA = { id: 'beta', name: 'Beta', gm: 2.5e9, radius: 160_000 } as const;
export const SEPARATION = 4_000_000;

/**
 * [ASSUMED] One distant sun (A3). Azimuth 200° puts it behind the arriving ship as it looks
 * at Alpha, so both bodies are well lit on arrival and Alpha's shadow falls across the far side
 * of a low orbit; it stands 12° above the binary's plane, so shadows are tilted cylinders, not
 * bands in the plane. 600 W/m² is roughly sunlight at Mars; brightness is an owner content
 * value (P14 item 3).
 */
export const SUN: Sun = {
  direction: fromAzEl((200 * Math.PI) / 180, (12 * Math.PI) / 180),
  irradiance: 600,
};

/**
 * [ASSUMED] True hardware calibration the model has to find (parameter IDs: contracts README).
 * The engine runs 2.5% under its rating with the baseline's 3 mrad mount error to the side and
 * a 2 mrad one downward; each IMU has a fixed accelerometer bias on each axis within 1C's
 * stated 5e-5 m/s². (The engine's gimbal also trims about 16 mrad downward through the centre
 * of mass, which sits below the hull axis; that is the design, not an error.)
 */
export const HIDDEN: HiddenParameters = {
  'thruster.main-engine.scale': 0.975,
  'thruster.main-engine.misalignment': 0.003,
  'thruster.main-engine.misalignment-pitch': -0.002,
  'sensor.imu-a.bias-x': 4e-5,
  'sensor.imu-a.bias-y': -2e-5,
  'sensor.imu-a.bias-z': 3e-5,
  'sensor.imu-b.bias-x': -3e-5,
  'sensor.imu-b.bias-y': 1e-5,
  'sensor.imu-b.bias-z': -2e-5,
};

/** Direction from Alpha to the arriving ship: the side away from Beta. */
export const ARRIVAL_ANGLE = Math.PI;

export function bodies(): readonly [MassiveBody, MassiveBody] {
  return circularBinary(LAW, ALPHA, BETA, SEPARATION).bodies;
}

const circularSpeedAbout = (gm: number, r: number): number =>
  analytic.circularSpeed(coupling(gm, LAW), LAW.exponent, r);

/** Orbit plane of a test particle: tilted from the binary's plane by `inclination` about a line of nodes at azimuth `node`. */
interface OrbitPlane {
  readonly node: number;
  readonly inclination: number;
}
const IN_PLANE: OrbitPlane = { node: 0, inclination: 0 };

/**
 * A test particle on a near-circular orbit about `host`, counter-clockwise seen from +z, in a
 * plane tilted from the binary's (x–y) plane. `lift` moves it along the orbit normal and
 * `climb` adds speed along it (a fraction of the circular speed), for a ring with thickness.
 */
function orbiting(
  id: string,
  host: MassiveBody,
  r: number,
  angle: number,
  speedFactor: number,
  radialFraction: number,
  radius: number,
  plane: OrbitPlane = IN_PLANE,
  lift = 0,
  climb = 0,
): Asteroid {
  const vc = circularSpeedAbout(host.gm, r);
  const vt = vc * speedFactor;
  const vr = vc * radialFraction;
  const tilt = fromAxisAngle(fromAzEl(plane.node), plane.inclination);
  const outward = rotate(tilt, fromAzEl(angle));
  const along = rotate(tilt, fromAzEl(angle + Math.PI / 2));
  const normal = rotate(tilt, { x: 0, y: 0, z: 1 });
  return {
    id,
    radius,
    position: add(host.position, add(scale(outward, r), scale(normal, lift))),
    velocity: add(
      host.velocity,
      add(add(scale(outward, vr), scale(along, vt)), scale(normal, vc * climb)),
    ),
  };
}

/**
 * [ASSUMED] The asteroid field about Alpha: test particles under the same law (brief §5).
 *
 * - 14 in a disc between 580 and 960 km, between the arrival orbit and Alpha, all turning the
 *   same way as the ship, their orbits tilted up to 6° out of the binary's plane;
 * - 2 on eccentric orbits that dip to about 450–550 km.
 * Radii 0.4–3.5 km. Seeded, so every attempt of a run meets the same field. They are where a
 * careful player probes the law before trying the slingshot (A6).
 */
export const ALPHA_FIELD = { disc: 14, dipping: 2, maxInclination: (6 * Math.PI) / 180 } as const;

function alphaField(seed: string, alpha: MassiveBody): Asteroid[] {
  const rng = createRng(seed).stream('content.asteroids');
  // The tilts come from their own stream, so the in-plane layout is the planar game's.
  const tilts = createRng(seed).stream('content.asteroids.tilt');
  const field: Asteroid[] = [];
  const size = (): number => 400 * Math.pow(3500 / 400, rng.next());
  const name = (): string => `a-${String(field.length + 1).padStart(2, '0')}`;
  const plane = (): OrbitPlane => ({
    node: tilts.range(-Math.PI, Math.PI),
    inclination: tilts.range(-ALPHA_FIELD.maxInclination, ALPHA_FIELD.maxInclination),
  });

  for (let i = 0; i < ALPHA_FIELD.disc; i++) {
    const r = 580_000 + ((960_000 - 580_000) * (i + rng.next())) / ALPHA_FIELD.disc;
    field.push(
      orbiting(
        name(),
        alpha,
        r,
        rng.range(-Math.PI, Math.PI),
        1 + rng.range(-0.02, 0.02),
        rng.range(-0.015, 0.015),
        size(),
        plane(),
      ),
    );
  }
  // Launched from 700 km slower than circular, so they fall toward Alpha and back.
  for (let i = 0; i < ALPHA_FIELD.dipping; i++) {
    field.push(
      orbiting(name(), alpha, 700_000, rng.range(-Math.PI, Math.PI), 0.86, 0, size(), plane()),
    );
  }
  return field;
}

/**
 * [ASSUMED] The belt (A6): a ring of rocks about Beta, where the slingshot goes.
 *
 * - **Where.** Seeded on near-circular orbits 700–860 km from Beta's centre. Alpha's pull makes
 *   every orbit breathe, so the ring actually fills about 600–1,000 km, with a thin tail to
 *   1,100 km. Passes that leave the binary at 50 m/s or more go 680–1,650 km from Beta, so the
 *   deep passes cross the ring twice and the wide ones skirt it. It cannot be wider: beyond
 *   about 900 km a prograde orbit about Beta is not stable for the length of a run
 *   [DEMONSTRATED: `gravity-range.test.ts`, the ring stays bound].
 * - **Which way.** Prograde: the rocks go round Beta the way Beta goes round Alpha. The pass
 *   that gains speed from Beta goes the same way, so the ship meets the rocks at 14–45 m/s:
 *   lethal, but slow enough to see coming and to dodge by hand. A pass the other way would
 *   meet them at over 100 m/s.
 * - **How thick.** In the binary's plane, a few kilometres thick (σ ≈ 5 km): about the size of
 *   the rocks. Flying in that plane, the ship is in the stream; 20 km above or below it, it is
 *   clear. That is the third dimension's part in this encounter.
 * - **How dense.** 320 rocks of 3–12 km radius. A pass flown through the ring without looking
 *   is lost 5 to 6 times in 10; a pass that trims by about 1 m/s to cross above the ring, or
 *   to thread it, is lost less than 1 time in 10 (2G handoff, slingshot study). Density is a
 *   play value.
 * The rocks move under the same law as everything else, so a model that has not learned the
 * law mispredicts them as well as the ship.
 */
export const BELT = {
  count: 320,
  inner: 700_000,
  outer: 860_000,
  /** Out-of-plane scatter, as a fraction of the orbit radius (position) and of the circular speed (velocity). */
  thickness: 0.006,
  /** Scatter of the tangential and radial speed, as a fraction of the circular speed. */
  eccentricity: 0.015,
  minRadius: 3_000,
  maxRadius: 12_000,
} as const;

function belt(seed: string, beta: MassiveBody): Asteroid[] {
  const rng = createRng(seed).stream('content.belt');
  const rocks: Asteroid[] = [];
  for (let i = 0; i < BELT.count; i++) {
    // Uniform over the ring's area.
    const r = Math.sqrt(
      BELT.inner * BELT.inner + (BELT.outer * BELT.outer - BELT.inner * BELT.inner) * rng.next(),
    );
    rocks.push(
      orbiting(
        `b-${String(i + 1).padStart(3, '0')}`,
        beta,
        r,
        rng.range(-Math.PI, Math.PI),
        1 + rng.normal(0, BELT.eccentricity),
        rng.normal(0, BELT.eccentricity),
        BELT.minRadius * Math.pow(BELT.maxRadius / BELT.minRadius, rng.next()),
        IN_PLANE,
        rng.normal(0, BELT.thickness * r),
        rng.normal(0, BELT.thickness),
      ),
    );
  }
  return rocks;
}

/**
 * Every asteroid at arrival: Alpha's field (`a-…`) and Beta's ring (`b-…`). Nothing starts
 * within 60 km of where the ship appears.
 */
export function asteroids(
  seed: string,
  host: readonly [MassiveBody, MassiveBody],
  arrivalAngle = ARRIVAL_ANGLE,
): Asteroid[] {
  const [alpha, beta] = host;
  // S8 rule 2: the exclusion round the actual arrival point, whatever the geometry.
  const ship = arrivalKinematics(alpha, arrivalAngle).position;
  return [...alphaField(seed, alpha), ...belt(seed, beta)].filter(
    (a) => distance(a.position, ship) > 60_000 + a.radius,
  );
}

/**
 * The ship's true arrival: circular about Alpha at r0 in the binary's plane, counter-clockwise,
 * nose along its path, at bearing `angle` about Alpha (π: opposite Beta; a catalogue geometry
 * adds its offset, `geometry.ts`).
 */
export function arrivalKinematics(
  alpha: MassiveBody,
  angle = ARRIVAL_ANGLE,
): TruthWorld['ship']['kinematics'] {
  const r = LAW.referenceRadius;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const v = circularSpeedAbout(alpha.gm, r);
  const velocity = { x: alpha.velocity.x - v * uy, y: alpha.velocity.y + v * ux, z: 0 };
  return {
    position: { x: alpha.position.x + r * ux, y: alpha.position.y + r * uy, z: 0 },
    velocity,
    attitude: fromYaw(Math.atan2(v * ux, -v * uy)),
    angularVelocity: { x: 0, y: 0, z: 0 },
  };
}

/**
 * The true world at arrival (t = 0). Recurrence resets to exactly this (P8). `seed` lays out the
 * rocks; `options.noise` roots the ship's sensor noise (default `seed`; each run has its own,
 * A10); `options.arrivalAngle` places the ship (default opposite Beta).
 */
export function arrivalWorld(
  definition: ShipDefinition,
  seed: string,
  options: { readonly noise?: string; readonly arrivalAngle?: number } = {},
): TruthWorld {
  const pair = bodies();
  const angle = options.arrivalAngle ?? ARRIVAL_ANGLE;
  return {
    t: 0,
    law: LAW,
    bodies: pair,
    asteroids: asteroids(seed, pair, angle),
    ship: {
      kinematics: arrivalKinematics(pair[0], angle),
      systems: createArrivalSystems(definition, HIDDEN, options.noise ?? seed),
    },
    fields: [],
    sun: SUN,
    hidden: HIDDEN,
  };
}
