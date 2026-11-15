/** S16 committed geometry. TRUTH ONLY: never export the catalogue to model or screens. */
import catalogue from './s16-catalogue.json';
import type { GardenLayout } from './layout.ts';
import { createRng } from '../../lib/rng.ts';
import { fromMatrix, IDENTITY, rotate } from '../../lib/quat.ts';
import { add, length, scale, sub, ZERO, type Vec3 } from '../../lib/vec3.ts';
import { DEFAULT_WELL_PROFILE } from '../../sim/fields/wells.ts';

export const S16_SOURCE_COMMIT = catalogue.source.commit;
export const S16_CONTENT_VERSION = `s16-${S16_SOURCE_COMMIT.slice(0, 7)}-1`;
export const S16_CATALOGUE_SEEDS = catalogue.admitted.map((entry) => entry.seed);
/** An intentionally generous upper bound from S16, not available ship performance. */
export const CERTIFICATE_ACCELERATION = (24_000 + 40 * 200 + 0.236) / 24_000;

export interface ArrivalCertificate {
  readonly t: number;
  readonly maximumRadius: number;
  readonly penetration: number;
  readonly certified: boolean;
}

/**
 * [DEMONSTRATED: S16] All-control reachable-ball bound, for source-free static geometry,
 * baseline mass >=24t and total available propulsion <=the stated generous force bound.
 * It is NOT a global fuel-wall proof, permission to reset an incoming ship, or a flight plan.
 */
export function certifyArrival(
  position: Vec3,
  velocity: Vec3,
  center: Vec3 = ZERO,
): ArrivalCertificate {
  const t = length(velocity) / CERTIFICATE_ACCELERATION;
  const maximumRadius =
    length(add(sub(position, center), scale(velocity, t))) + 0.5 * CERTIFICATE_ACCELERATION * t * t;
  const penetration = DEFAULT_WELL_PROFILE.outerRadius - maximumRadius;
  return { t, maximumRadius, penetration, certified: penetration >= 100 };
}

const vec = (v: readonly number[]): Vec3 => ({ x: v[0]!, y: v[1]!, z: v[2]! });

export interface StudyGardenLayout extends GardenLayout {
  readonly catalogueSeed?: number;
  readonly sourceCommit: string;
  readonly arrivalCertificate: ArrivalCertificate;
}

/**
 * Import a particular admitted mechanics candidate, or the nominal study fixture.
 * Catalogue membership certifies the independent reference cases only; sensors, actual
 * turns, inherited damage, transit and human playability still need session admission.
 */
export function s16Layout(catalogueSeed?: number): StudyGardenLayout {
  const entry =
    catalogueSeed === undefined
      ? undefined
      : catalogue.admitted.find((item) => item.seed === catalogueSeed);
  if (catalogueSeed !== undefined && !entry)
    throw new Error(`S16 seed ${catalogueSeed} is not in the admitted mechanics catalogue`);
  const rotation = entry ? fromMatrix(entry.garden_to_encounter_rotation.flat()) : IDENTITY;
  const transform = (v: readonly number[]) => rotate(rotation, vec(v));
  const initial = entry?.initial ?? catalogue.layout.arrival;
  const position = transform(initial.position_m);
  const velocity = transform(initial.velocity_m_s);
  const centers = (entry?.centers_m ?? catalogue.layout.centers_m).map(transform);
  return {
    version: `${S16_CONTENT_VERSION}-${catalogueSeed ?? 'nominal'}`,
    status: 'study-layout',
    sourceCommit: S16_SOURCE_COMMIT,
    catalogueSeed,
    wells: centers.map((center, i) => ({ id: `garden-${String.fromCharCode(97 + i)}`, center })),
    landmarks: [], // A well does not supply gravity; preserve the reference's empty sum.
    entrances: { power: { position, velocity, attitude: rotation, angularVelocity: ZERO } },
    exits: [
      {
        id: 'forward',
        destination: 'P04',
        center: transform([catalogue.layout.exit.x_m, 0, 0]),
        radius: catalogue.layout.exit.disc_radius_m,
        outwardNormal: rotate(rotation, { x: 1, y: 0, z: 0 }),
      },
      // [ASSUMED] Optional connector descriptor, not an S16-certified N03 arrival/route.
      {
        id: 'cross-transfer',
        destination: 'N03',
        center: transform([160_000, 120_000, 20_000]),
        radius: 20_000,
      },
    ],
    // A3: one fixed external sun; formation rotation does not rotate illumination.
    sun: { direction: { x: 0, y: 0, z: 1 }, irradiance: 600 },
    arrivalCertificate: certifyArrival(position, velocity, centers[0]),
  };
}

/** A run selects from the finite approved-mechanics candidates with an independent stream. */
export function seededS16Layout(seed: string): StudyGardenLayout {
  const rng = createRng(seed).stream('content.inverse-wells.s16-catalogue');
  return s16Layout(S16_CATALOGUE_SEEDS[rng.int(0, S16_CATALOGUE_SEEDS.length - 1)]!);
}
