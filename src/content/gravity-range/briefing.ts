/**
 * What the ship knows on arrival at the Gravity range. Built from the true arrival world plus
 * seeded survey error, then handed to the believed side: this is the only place the encounter's
 * truth is turned into prior knowledge.
 *
 * Frame (1G spec §3.4): Alpha at the origin and at rest at t = 0, axes parallel to the inertial
 * ones. Everything the believed side holds is in this frame, never in truth's barycentric one.
 */

import type {
  BelievedAsteroid,
  BelievedBody,
  EncounterBriefing,
  Objective,
  ParameterPrior,
  ShipEstimate,
} from '../../contracts/index.ts';
import { isoCov3 } from '../../contracts/index.ts';
import type { TruthWorld } from '../../contracts/truth/index.ts';
import { fromRotationVector, multiply } from '../../lib/quat.ts';
import { createRng } from '../../lib/rng.ts';
import type { Vec3 } from '../../lib/vec3.ts';

export const ENCOUNTER_ID = 'gravity-range';

/**
 * [ASSUMED; owner direction A6] The objective: leave the binary on a slingshot past Beta.
 * Judged when the ship is `beyond` this distance from the pair's centre of mass: it must be
 * moving at `minSpeed` or more relative to it, having spent no more than `maxDeltaV`. Without
 * Beta's help 16 m/s leaves at under 40 m/s; a pass 680–1,650 km from Beta leaves at 50–66 m/s
 * (2G handoff, slingshot study).
 */
export const DEPART = { beyond: 9_000_000, minSpeed: 50, maxDeltaV: 16 } as const;

/** [ASSUMED] One-sigma survey error on arrival. */
const SIGMA = {
  shipPosition: 1_500,
  shipVelocity: 0.15,
  attitude: 4e-5,
  betaPosition: 5_000,
  betaVelocity: 0.3,
  asteroidPosition: 5_000,
  asteroidVelocity: 0.5,
} as const;

/** Asteroids at least this large were picked up by the arrival survey. */
const SURVEYED_RADIUS = 1_000;

/**
 * [ASSUMED] Model priors (parameter IDs: contracts README). Alpha's GM comes from the arrival
 * calibration at r0 (2% high, as in 1G's vectors); Beta is only roughly weighed; the hardware
 * priors are nominal ratings with spec-sheet tolerances.
 */
export const PRIORS: readonly ParameterPrior[] = [
  { id: 'body.alpha.mu', label: 'Alpha μ', unit: 'm³/s²', value: 1.02e10, sigma: 3.0e8 },
  { id: 'body.beta.mu', label: 'Beta μ', unit: 'm³/s²', value: 2.2e9, sigma: 8.0e8 },
  { id: 'thruster.main-engine.scale', label: 'Main thrust scale', unit: '', value: 1, sigma: 0.05 },
  {
    id: 'thruster.main-engine.misalignment',
    label: 'Main thrust angle',
    unit: 'rad',
    value: 0,
    sigma: 0.01,
  },
  { id: 'sensor.imu-a.bias-x', label: 'IMU A bias x', unit: 'm/s²', value: 0, sigma: 5e-5 },
  { id: 'sensor.imu-a.bias-y', label: 'IMU A bias y', unit: 'm/s²', value: 0, sigma: 5e-5 },
  {
    id: 'law.gravity.exponent',
    label: 'Distance-law exponent',
    unit: '',
    value: 2,
    sigma: 1,
    extension: 'distance-law',
  },
];

export const OBJECTIVES: readonly Objective[] = [
  {
    id: 'depart',
    kind: 'depart',
    label: `DEPART ${DEPART.minSpeed} M/S`,
    depart: { beyond: DEPART.beyond, minSpeed: DEPART.minSpeed },
    maxDeltaV: DEPART.maxDeltaV,
  },
];

export function briefing(world: TruthWorld, seed: string): EncounterBriefing {
  const rng = createRng(seed).stream('content.briefing');
  const alpha = world.bodies.find((b) => b.id === 'alpha')!;
  const noisy = (value: number, sigma: number): number => rng.normal(value, sigma);
  // The out-of-plane survey errors come from their own stream, so the in-plane survey draws
  // the same numbers as the planar game did.
  const vertical = createRng(seed).stream('content.briefing.z');
  const relative = (p: Vec3, v: Vec3, sigmaP: number, sigmaV: number) => ({
    position: {
      x: noisy(p.x - alpha.position.x, sigmaP),
      y: noisy(p.y - alpha.position.y, sigmaP),
      z: vertical.normal(p.z - alpha.position.z, sigmaP),
    },
    velocity: {
      x: noisy(v.x - alpha.velocity.x, sigmaV),
      y: noisy(v.y - alpha.velocity.y, sigmaV),
      z: vertical.normal(v.z - alpha.velocity.z, sigmaV),
    },
  });

  const k = world.ship.kinematics;
  const surveyedState = relative(k.position, k.velocity, SIGMA.shipPosition, SIGMA.shipVelocity);
  const yawError = noisy(0, SIGMA.attitude);
  const surveyedAttitude = multiply(
    k.attitude,
    fromRotationVector({
      x: vertical.normal(0, SIGMA.attitude),
      y: vertical.normal(0, SIGMA.attitude),
      z: yawError,
    }),
  );
  const arrivalEstimate: ShipEstimate = {
    t: 0,
    ...surveyedState,
    positionCov: isoCov3(SIGMA.shipPosition),
    velocityCov: isoCov3(SIGMA.shipVelocity),
    // The true attitude with a small error about each body axis: yaw from the same stream as
    // before, roll and pitch from the out-of-plane stream.
    attitude: surveyedAttitude,
    attitudeSigma: SIGMA.attitude,
    angularVelocity: { x: 0, y: 0, z: 0 },
  };

  const knownBodies: BelievedBody[] = world.bodies.map((b) =>
    b.id === alpha.id
      ? {
          id: b.id,
          name: b.name,
          position: { x: 0, y: 0, z: 0 },
          velocity: { x: 0, y: 0, z: 0 },
          positionCov: isoCov3(0),
          radius: b.radius,
          tracked: false,
          lastFix: 0,
        }
      : {
          id: b.id,
          name: b.name,
          ...relative(b.position, b.velocity, SIGMA.betaPosition, SIGMA.betaVelocity),
          positionCov: isoCov3(SIGMA.betaPosition),
          radius: b.radius,
          tracked: false,
          lastFix: 0,
        },
  );

  const knownAsteroids: BelievedAsteroid[] = world.asteroids
    .filter((a) => a.radius >= SURVEYED_RADIUS)
    .map((a) => ({
      id: a.id,
      ...relative(a.position, a.velocity, SIGMA.asteroidPosition, SIGMA.asteroidVelocity),
      positionCov: isoCov3(SIGMA.asteroidPosition),
      radius: a.radius,
      tracked: false,
      lastSeen: 0,
    }));

  return {
    id: ENCOUNTER_ID,
    name: 'Gravity range',
    objectives: OBJECTIVES,
    arrivalEstimate,
    arrivalConfiguration: world.ship.systems.configuration,
    priors: PRIORS,
    knownBodies,
    knownAsteroids,
    referenceRadius: world.law.referenceRadius,
  };
}
