/**
 * TRUTH contracts. Belief-side code (src/model, src/blackbox, src/console, src/view3d) may not
 * import anything from this folder (DECISIONS P11, enforced by eslint.config.js).
 */
export type * from './world.ts';
export type * from './ship.ts';
export type * from './events.ts';
export type * from './encounter.ts';
export type * from './fields.ts';
export { createFieldRegistry } from './fields.ts';
