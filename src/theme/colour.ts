/**
 * Night Watch colour tokens (owner sign-off 2026-11-14). sRGB hex.
 *
 * Names are roles: what a colour means, never what it looks like. Pick the role, not the hue.
 * See docs/design/visual-direction.md § Palette for the rules behind each role.
 */
export const colour = {
  // Compartment and console surfaces
  room: '#060504',
  table: '#0e0b08',
  tableEdge: '#2b2117',
  tableLip: '#1a140e',
  panel: '#130f0b',
  panelEdge: '#2d2419',
  /** 3D sensor view clear colour. */
  viewBackground: '#080605',

  // Ink: text, hull, the measured world
  ink: '#efe3cc',
  /** Secondary text. Still meets 4.5:1 on panel. */
  inkDim: '#a08f74',
  /** Non-essential marks only: units, axis ticks, rules. Not for information the player needs. */
  inkFaint: '#5c4f3e',

  // Flight plane and sensor coverage
  grid: '#3a2d1f',
  gridMajor: '#6b5235',
  /** Hatch over space the ship has never sensed. */
  unknown: '#2c2118',
  /** Tint and edge of the region sensed right now. */
  coverage: '#f3e6cc',

  // What the display means
  /** What actually happened: measured trail, the ship, its body axis and CoM. */
  measured: '#f3e6cc',
  /** What the model said would happen: issued forecasts and their envelope. Cool against warm reality. */
  forecast: '#79c9c4',
  velocity: '#a8d86e',
  /** Commanded thrust: line of action, chevron, planned burns. */
  thrust: '#f06ad2',
  /** Anything Black Box carried or preserved: earlier attempts, prior evidence, issue marks. International orange, like a real flight recorder. */
  blackbox: '#ff7a1c',

  // Alerts. Always paired with a shape (advisory ○, caution ▲, warning ■). DD01 V2 10045.
  advisory: '#efe3cc',
  caution: '#ffd23f',
  warning: '#ff3344',

  // Phenomena
  well: '#9b8cff',
  lattice: '#9b8cff',
  /** Hottest part of a lattice strand. */
  latticeCore: '#ece6ff',

  // Bodies and hull materials
  body: '#2a2018',
  bodyRim: '#ffb070',
  asteroid: '#c9b89a',
  hull: '#3a3026',
  hullEmissive: '#120d08',
} as const;

export type ColourRole = keyof typeof colour;

/** Soft overhead light pool in the compartment (CSS only). */
export const roomLight = 'rgba(255, 170, 90, 0.10)';

/** Opacities that belong to a role. 0–1. */
export const opacity = {
  coverageTint: 0.035,
  coverageEdge: 0.22,
  gridMinor: 0.55,
  /** Grid where the ship sensed earlier but not now (multiplies the grid). */
  staleGrid: 0.42,
  unknownHatch: 0.6,
  /** The flight plane is faintly opaque so anything below it reads as below. */
  planeVeil: 0.45,
  envelopeBody: 0.13,
  envelopeEdge: 0.55,
  extrapolatedBody: 0.04,
  extrapolatedEdge: 0.3,
  extrapolatedHatch: 0.2,
  previousAttempt: 0.55,
  /** Asteroid rings known only from an earlier attempt's record. */
  priorEvidence: 0.3,
  /** Floor for stale markers as they age. */
  staleMin: 0.2,
  bodyFootprint: 0.55,
  shipFootprint: 0.55,
  hullEdges: 0.8,
  connector: 0.6,
} as const;

/** '#rrggbb' → 0xrrggbb, for Three.js. */
export function hex(c: string): number {
  return Number.parseInt(c.slice(1, 7), 16);
}
