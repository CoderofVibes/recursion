/**
 * Line weights and dash patterns. Widths are screen pixels at 1× (Three.js LineMaterial
 * `linewidth` with worldUnits off). Dashes are screen pixels too: keep the dotted forecast
 * the same rhythm at every zoom (scale LineMaterial dashes with camera distance).
 */
export const line = {
  measured: 2.4,
  forecast: 2.0,
  previousAttempt: 1.3,
  /** Equal-time links in a two-attempt comparison; forecast-now link. */
  connector: 1.0,
  bodyAxis: 3.0,
  thrustLine: 1.2,
  thrustChevron: 2.4,
  velocity: 1.6,
  shipFootprint: 1.3,
  bodyFootprint: 1.2,
  /** Well response-reversal boundary, objective gates. */
  boundary: 1.6,
  /** Planned burn highlighted on a forecast. */
  plannedBurn: 2.2,
  /** Horizon bar and knee bar across an envelope. */
  envelopeBar: 1.2,
  /** Instruments (2D canvas / SVG). */
  trace: 1.6,
  traceSecondary: 1.0,
  rule: 1.0,
} as const;

/** [dash, gap] in screen px. */
export const dash = {
  /** Issued forecast: dotted. */
  forecast: [3, 5],
  /** Thrust line of action. */
  thrustLine: [4, 3],
  /** Well boundary. */
  boundary: [8, 6],
  /** Forecast-now link from the ship to where the forecast placed it. */
  connector: [3, 3],
  /** Envelope edge on instruments. */
  envelopeEdge: [2, 3],
} as const;

/** Hatch patterns (world units on the flight plane; px on instruments). */
export const hatch = {
  /** Never-sensed space on the flight plane, 45°. */
  unknownSpacing: 6,
  /** Extrapolated part of a forecast envelope, −45°. */
  envelopeSpacing: 2.4,
  /** CSS legend swatch. */
  legendPx: 4,
} as const;
