/**
 * src/theme — how Recursion looks (Night Watch). Owner: 1E, the UI lane.
 * UI code takes every visual value from here (Convention 11). Belief side (P11).
 * Rules and rationale: docs/design/visual-direction.md.
 */
export { colour, roomLight, opacity, hex } from './colour.ts';
export type { ColourRole } from './colour.ts';
export { type } from './type.ts';
export { space, surface } from './space.ts';
export { line, dash, hatch } from './line.ts';
export { motion } from './motion.ts';
export { render } from './render.ts';
export { cssVariables } from './css.ts';
export { lineStyles, envelopeStyle, planeStyle, objectStyle } from './three/styles.ts';
export type { LineStyle } from './three/styles.ts';
