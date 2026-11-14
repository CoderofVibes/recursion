// Night Watch — the chosen visual direction (owner sign-off 2026-11-14).
// Mirror of src/theme/ for this standalone prototype. Keep the two in step:
// src/theme/ is the source of truth for the game.

export const colour = {
  // Compartment and console surfaces
  room: '#060504',
  roomLight: 'rgba(255, 170, 90, 0.10)',
  table: '#0e0b08',
  tableEdge: '#2b2117',
  tableLip: '#1a140e',
  panel: '#130f0b',
  panelEdge: '#2d2419',
  viewBackground: '#080605',

  // Ink (text, hull, the measured world)
  ink: '#efe3cc',
  inkDim: '#a08f74',
  inkFaint: '#5c4f3e',

  // Flight plane and coverage
  grid: '#3a2d1f',
  gridMajor: '#6b5235',
  unknown: '#2c2118',
  coverage: '#f3e6cc',

  // What the display means
  measured: '#f3e6cc',
  forecast: '#79c9c4',
  velocity: '#a8d86e',
  thrust: '#f06ad2',
  blackbox: '#ff7a1c',

  // Alerts (always paired with a shape: advisory ○, caution ▲, warning ■)
  advisory: '#efe3cc',
  caution: '#ffd23f',
  warning: '#ff3344',

  // Phenomena
  well: '#9b8cff',
  lattice: '#9b8cff',
  latticeCore: '#ece6ff',

  // Bodies
  body: '#2a2018',
  bodyRim: '#ffb070',
  asteroid: '#c9b89a',
  hull: '#3a3026',
  hullEmissive: '#120d08',
};

export const alpha = {
  coverageTint: 0.035,
  coverageEdge: 0.22,
  gridMinor: 0.55,
  staleGrid: 0.42,
  unknownHatch: 0.6,
  planeVeil: 0.45,
  envelopeBody: 0.13,
  envelopeEdge: 0.55,
  extrapolatedBody: 0.04,
  extrapolatedEdge: 0.3,
  extrapolatedHatch: 0.2,
  previousAttempt: 0.55,
  priorEvidence: 0.3,
  staleMin: 0.2,
};

export const line = {
  // CSS pixels at 1×; Three.js LineMaterial widths use these directly.
  measured: 2.4,
  forecast: 2.0,
  forecastDot: [0.55, 1.05],      // dash, gap (world units in the prototype; screen px in the game)
  previousAttempt: 1.3,
  bodyAxis: 3.0,
  thrustLine: 1.2,
  thrustChevron: 2.4,
  velocity: 1.6,
  footprint: 1.3,
  bodyFootprint: 1.2,
  connector: 1.0,
  boundary: 1.6,
  hatchSpacing: 6,                // world units, unknown-space hatch
  envelopeHatchSpacing: 2.4,
};

export const type = {
  family: '"Cascadia Mono", "Cascadia Code", Consolas, "SF Mono", Menlo, "DejaVu Sans Mono", monospace',
  size: { small: 10, label: 11, body: 12, value: 15, readout: 18, display: 20 },
  tracking: { label: '0.08em', body: '0.04em' },
  weight: { regular: 400, strong: 600 },
};

export const motion = {
  instant: 0,
  fast: 120,
  base: 200,
  alertIn: 300,
  flicker: 60,
  settle: 600,
  camera: 450,
  breathe: 2400,
  easing: { out: 'cubic-bezier(0.2, 0.0, 0.0, 1.0)', inOut: 'cubic-bezier(0.4, 0.0, 0.2, 1.0)' },
  cameraDamping: 0.08,
};

export const render = {
  bloom: { strength: 0.55, radius: 0.35, threshold: 0.12 },
  fogDensity: 0.0042,
  keyLight: [-0.6, 0.5, -0.4],
  rimStrength: 0.55,
  shipMinScreenScale: 70,         // world-units-per-symbol-scale divisor (see doc § Ship)
};

export const hex = (c) => parseInt(c.slice(1), 16);
