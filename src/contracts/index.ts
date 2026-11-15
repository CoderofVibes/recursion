/**
 * Shared and belief-side contracts. Safe to import anywhere.
 * Truth types are in ./truth/ and are deliberately not re-exported here (DECISIONS P11).
 * See README.md for every type.
 */
export type { Vec3 } from '../lib/vec3.ts';
export type { Quat } from '../lib/quat.ts';
export type { Vec2 } from '../lib/vec2.ts';
export type * from './units.ts';
export type * from './ids.ts';
export type * from './estimates.ts';
export {
  cov3FromPlanar,
  covEllipse,
  covEllipsoid,
  covEntry,
  isoCov2,
  isoCov3,
  projectCov3,
  varianceAlong,
} from './estimates.ts';
export type * from './ship.ts';
export { hullReach, isotropicInertia, prismHull } from './ship.ts';
export type * from './commands.ts';
export { HANDS_ON_NEUTRAL, isHandsOnNeutral } from './commands.ts';
export type * from './measurements.ts';
export type * from './belief.ts';
export type * from './model.ts';
export { KNOWN_EXTENSIONS } from './model.ts';
export type * from './forecast.ts';
export { issueForecast } from './forecast.ts';
export type * from './attempt.ts';
export type * from './encounter.ts';
export type * from './view.ts';
export type * from './chart.ts';
// Additive recorded-data contracts (A16); no truth-side geometry or existing schema changes.
export type * from './lattice-acquisition.ts';
export type * from './lattice-coverage.ts';
