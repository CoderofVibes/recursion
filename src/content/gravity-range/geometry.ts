/**
 * TRUTH. The catalogue of validated arrival geometries for the Gravity range (DECISIONS A10,
 * A18 (4)): a fixed list, not a continuous range, each admitted by S8's rejection rules
 * (`docs/studies/s8/seeds.md`). A run's seed picks one; the laws, the bodies' masses and sizes,
 * the separation and the ship never vary.
 *
 * The free parameter is S8's relative arrival offset δ: the ship arrives on its circular
 * 1,000 km orbit about Alpha at bearing 180° + δ from the line joining the bodies (the binary's
 * phase stays 0, so the sun keeps its place relative to the bodies). Position and velocity
 * turn together. S8 admitted ±15° in 5° steps (its first-window search found no robust route
 * at +25° or +30°, `seeds.json` `rejected_seed`). Each entry carries S8's certificate: the one
 * prograde impulse (relative to Alpha) its search chose, where it passes Beta and how fast it
 * leaves. `geometry.test.ts` flies every certificate, and S8's nine perturbed controls round
 * it, in this game's own simulation.
 *
 * Not varied yet: the ring's layout and phase (A18 (2): study S21 resizes the belt; S8's ring
 * phase screen used its own layout, not this one) and Alpha's field, which keeps its seeded
 * layout with the arrival exclusion applied round each geometry's own arrival point.
 */

import { hashString32 } from '../../lib/rng.ts';

const DEG = Math.PI / 180;

export interface ArrivalGeometry {
  readonly id: string;
  /** δ, rad: the arrival bearing about Alpha is π + δ from the line from Alpha to Beta. */
  readonly offset: number;
  /**
   * S21's certificate for this geometry, the route the content is built round (A18 (2)): S8's
   * burn epoch with 0.2 m/s less, which passes Beta at about 830 km, inside the radiation
   * crescent, then a +1 m/s lift along inertial +z over the ring (S21 `catalogue.json`; impulses
   * as delivered velocity). Zero cloud exposure, clear of S21's fixed rock layout by 6–20 km.
   */
  readonly route: {
    /** s after arrival; the burn is along the velocity relative to Alpha. */
    readonly burnAt: number;
    /** m/s. */
    readonly deltaV: number;
    /** s after arrival, and the lift along inertial +z, m/s. */
    readonly liftAt: number;
    readonly lift: number;
    /** Closest approach to Beta's centre, m (S21, sampled every 120 s). */
    readonly betaClosest: number;
    /** The first sample past 9,000 km from the barycentre, s, and the speed there, m/s. */
    readonly exitAt: number;
    readonly exitSpeed: number;
  };
  /**
   * S8's certificate (`seeds.json`): one impulse, passing Beta at about 980 km. Retired as a
   * route: the radiation crescent makes it lethal (S21). Kept for S8's own vectors.
   */
  readonly s8: {
    readonly burnAt: number;
    readonly deltaV: number;
    readonly betaClosest: number;
    readonly exitSpeed: number;
  };
}

/** The seven offsets S8 admitted, with S21's adapted routes. */
export const GEOMETRIES: readonly ArrivalGeometry[] = [
  {
    id: 'd-15',
    offset: -15 * DEG,
    route: {
      burnAt: 6_360.0,
      deltaV: 13.4,
      liftAt: 86_160,
      lift: 1,
      betaClosest: 811_663,
      exitAt: 258_240.0,
      exitSpeed: 60.912,
    },
    s8: { burnAt: 6_360, deltaV: 13.6, betaClosest: 974_746, exitSpeed: 65.638 },
  },
  {
    id: 'd-10',
    offset: -10 * DEG,
    route: {
      burnAt: 5_640.0,
      deltaV: 13.6,
      liftAt: 83_280,
      lift: 1,
      betaClosest: 830_642,
      exitAt: 249_360.0,
      exitSpeed: 62.908,
    },
    s8: { burnAt: 5_640, deltaV: 13.8, betaClosest: 986_395, exitSpeed: 65.966 },
  },
  {
    id: 'd-05',
    offset: -5 * DEG,
    route: {
      burnAt: 4_680.0,
      deltaV: 13.6,
      liftAt: 82_200,
      lift: 1,
      betaClosest: 814_192,
      exitAt: 250_680.0,
      exitSpeed: 62.122,
    },
    s8: { burnAt: 4_680, deltaV: 13.8, betaClosest: 970_059, exitSpeed: 66.008 },
  },
  {
    id: 'd+00',
    offset: 0,
    route: {
      burnAt: 3_960.0,
      deltaV: 13.8,
      liftAt: 79_440,
      lift: 1,
      betaClosest: 832_662,
      exitAt: 242_400.0,
      exitSpeed: 63.897,
    },
    s8: { burnAt: 3_960, deltaV: 14.0, betaClosest: 981_456, exitSpeed: 66.306 },
  },
  {
    id: 'd+05',
    offset: 5 * DEG,
    route: {
      burnAt: 3_000.0,
      deltaV: 13.8,
      liftAt: 78_360,
      lift: 1,
      betaClosest: 822_837,
      exitAt: 242_520.0,
      exitSpeed: 63.527,
    },
    s8: { burnAt: 3_000, deltaV: 14.0, betaClosest: 971_577, exitSpeed: 66.359 },
  },
  {
    id: 'd+10',
    offset: 10 * DEG,
    route: {
      burnAt: 2_280.0,
      deltaV: 14.0,
      liftAt: 75_600,
      lift: 1,
      betaClosest: 840_315,
      exitAt: 235_200.0,
      exitSpeed: 64.998,
    },
    s8: { burnAt: 2_280, deltaV: 14.2, betaClosest: 982_216, exitSpeed: 66.614 },
  },
  {
    id: 'd+15',
    offset: 15 * DEG,
    route: {
      burnAt: 1_320.0,
      deltaV: 14.0,
      liftAt: 74_520,
      lift: 1,
      betaClosest: 836_090,
      exitAt: 234_480.0,
      exitSpeed: 64.906,
    },
    s8: { burnAt: 1_320, deltaV: 14.2, betaClosest: 977_766, exitSpeed: 66.664 },
  },
];

/** The reference geometry every study used: arrival opposite Beta. */
export const NOMINAL = GEOMETRIES.find((g) => g.id === 'd+00')!;

/**
 * The geometry of run `run` (0-based over the save). [ASSUMED] The first run meets the
 * reference geometry, so a first-time player starts where the studies did; later runs draw
 * from the catalogue by a hash of the encounter's seed and the run, so a save replays exactly.
 */
export function geometryForRun(seed: string, run: number): ArrivalGeometry {
  if (run <= 0) return NOMINAL;
  return GEOMETRIES[hashString32(`${seed}/geometry/${run}`) % GEOMETRIES.length]!;
}
