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
  /** S8's certificate: one impulse along the velocity relative to Alpha. */
  readonly route: {
    /** s after arrival. */
    readonly burnAt: number;
    /** m/s. */
    readonly deltaV: number;
    /** Closest approach to Beta's centre, m (S8, sampled every 30 s). */
    readonly betaClosest: number;
    /** Speed relative to the barycentre at the first 30 s sample past 9,000 km, m/s. */
    readonly exitSpeed: number;
  };
}

/** S8 `seeds.json` `catalogue.candidates`, the seven recommended offsets. */
export const GEOMETRIES: readonly ArrivalGeometry[] = [
  {
    id: 'd-15',
    offset: -15 * DEG,
    route: { burnAt: 6_360, deltaV: 13.6, betaClosest: 974_746, exitSpeed: 65.638 },
  },
  {
    id: 'd-10',
    offset: -10 * DEG,
    route: { burnAt: 5_640, deltaV: 13.8, betaClosest: 986_395, exitSpeed: 65.966 },
  },
  {
    id: 'd-05',
    offset: -5 * DEG,
    route: { burnAt: 4_680, deltaV: 13.8, betaClosest: 970_059, exitSpeed: 66.008 },
  },
  {
    id: 'd+00',
    offset: 0,
    route: { burnAt: 3_960, deltaV: 14.0, betaClosest: 981_456, exitSpeed: 66.306 },
  },
  {
    id: 'd+05',
    offset: 5 * DEG,
    route: { burnAt: 3_000, deltaV: 14.0, betaClosest: 971_577, exitSpeed: 66.359 },
  },
  {
    id: 'd+10',
    offset: 10 * DEG,
    route: { burnAt: 2_280, deltaV: 14.2, betaClosest: 982_216, exitSpeed: 66.614 },
  },
  {
    id: 'd+15',
    offset: 15 * DEG,
    route: { burnAt: 1_320, deltaV: 14.2, betaClosest: 977_766, exitSpeed: 66.664 },
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
