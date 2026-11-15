/**
 * Truth simulation (2A). Truth side only: src/game, src/content and src/ship may import this;
 * belief-side code may not (P11, lint-enforced). See README.md.
 */

export { createSimulation, validateWorld } from './simulation.ts';
export type * from './types.ts';
export { coupling, inverseDistancePower, accelerationFrom, potentialFrom } from './gravity.ts';
export * as analytic from './analytic.ts';
export {
  circularBinary,
  circularBinaryPlane,
  type CircularBinarySpec,
  type CircularBinaryOptions,
} from './analytic.ts';
export * as invariants from './invariants.ts';
export { bodyPointToWorld, hullInWorld, sensorTargets } from './snapshot.ts';
