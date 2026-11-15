/**
 * Semantic 3D line and mark styles for the sensor view (2E, 3F). Plain data: build Three.js
 * materials from these, never from literal values. Rules: docs/design/visual-direction.md.
 */
import { colour, opacity } from '../colour.ts';
import { dash, hatch, line } from '../line.ts';

export interface LineStyle {
  readonly colour: string;
  /** Screen px. */
  readonly width: number;
  readonly opacity: number;
  /** [dash, gap] screen px; absent = solid. */
  readonly dash?: readonly [number, number];
}

const solid = (c: string, width: number, o = 1): LineStyle => ({ colour: c, width, opacity: o });
const dashed = (c: string, width: number, d: readonly [number, number], o = 1): LineStyle => ({
  colour: c,
  width,
  opacity: o,
  dash: d,
});

export const lineStyles = {
  /** Measured path of the current attempt: solid ink. */
  trail: solid(colour.measured, line.measured),
  /** Issued forecast centre-of-mass path: dotted, frozen, ends at its horizon. */
  forecast: dashed(colour.forecast, line.forecast, dash.forecast),
  /** Bar across the envelope at the forecast's horizon. */
  forecastHorizon: solid(colour.forecast, line.forecast, 0.9),
  /** Bar across the envelope where the forecast leaves sampled space. */
  forecastKnee: solid(colour.forecast, line.envelopeBar, 0.8),
  /** A planned burn, drawn over the forecast path. */
  plannedBurn: solid(colour.thrust, line.plannedBurn, 0.7),
  /** Link from the ship to where the forecast placed it now. Turns caution when outside 2σ. */
  forecastNowLink: dashed(colour.forecast, line.connector, dash.connector, opacity.connector),
  /** An earlier attempt (Black Box record), with time ticks every 5 s. */
  previousAttempt: solid(colour.blackbox, line.previousAttempt, opacity.previousAttempt),
  /** Equal-time links between two compared attempts. */
  compareLink: solid(colour.ink, line.connector, 0.28),
  bodyAxis: solid(colour.measured, line.bodyAxis),
  thrustLine: dashed(colour.thrust, line.thrustLine, dash.thrustLine),
  thrustChevron: solid(colour.thrust, line.thrustChevron),
  /** Attitude jets turning or steadying the ship: chevrons only, quiet, no line of action. */
  attitudeJet: solid(colour.thrust, line.thrustLine, opacity.attitudeJet),
  velocity: solid(colour.velocity, line.velocity, 0.95),
  shipFootprint: solid(colour.measured, line.shipFootprint, opacity.shipFootprint),
  bodyFootprint: solid(colour.bodyRim, line.bodyFootprint, opacity.bodyFootprint),
  damageNotch: solid(colour.warning, 3),
  wellMouth: solid(colour.well, 1.2, 0.85),
  wellBoundary: dashed(colour.well, line.boundary, dash.boundary),
  objectiveGate: solid(colour.ink, line.boundary, 0.7),
} as const satisfies Record<string, LineStyle>;

/** Forecast uncertainty envelope (half-width = 2σ). Hatched where the forecast extrapolates. */
export const envelopeStyle = {
  colour: colour.forecast,
  sigmas: 2,
  body: opacity.envelopeBody,
  edge: opacity.envelopeEdge,
  extrapolatedBody: opacity.extrapolatedBody,
  extrapolatedEdge: opacity.extrapolatedEdge,
  extrapolatedHatch: opacity.extrapolatedHatch,
  /** Extrapolating, but inside an adopted rule's validated span (ForecastSample.validated, A5). */
  validatedBody: opacity.validatedBody,
  validatedEdge: opacity.validatedEdge,
  validatedHatch: opacity.validatedHatch,
  /** Hatch spacing in world units; the view scales these to the encounter. */
  hatchSpacing: hatch.envelopeSpacing,
  validatedHatchSpacing: hatch.validatedSpacing,
} as const;

/** Flight plane and sensor coverage. */
export const planeStyle = {
  grid: colour.grid,
  gridMajor: colour.gridMajor,
  /** World units between minor / major grid lines. 2E sets these for the encounter scale. */
  minorSpacing: 10,
  majorSpacing: 50,
  gridMinor: opacity.gridMinor,
  staleGrid: opacity.staleGrid,
  unknown: colour.unknown,
  unknownHatch: opacity.unknownHatch,
  coverage: colour.coverage,
  coverageTint: opacity.coverageTint,
  coverageEdge: opacity.coverageEdge,
  veil: opacity.planeVeil,
  veilColour: colour.viewBackground,
  /** Hatch spacing over never-sensed space, world units. */
  unknownSpacing: hatch.unknownSpacing,
  /**
   * Ship seconds after which space sensed earlier reads as unknown again: the hatch returns as
   * the look ages, because rocks move [ASSUMED 2 h; an 8 h dive outlasts it unless the camera
   * keeps looking, which is the point of P12].
   */
  earlierMemory: 7200,
} as const;

/** Asteroid and object marks by what the ship knows about them. */
export const objectStyle = {
  /** In coverage now: solid low-poly rock. */
  tracked: { colour: colour.asteroid, emissive: 0.25 },
  /** Seen earlier this attempt: ring at last fix, radius grows with position sigma. */
  stale: { colour: colour.asteroid, minOpacity: opacity.staleMin },
  /** Known only from an earlier attempt's record. */
  prior: { colour: colour.blackbox, opacity: opacity.priorEvidence },
  /** Never sensed: not drawn. */
} as const;
