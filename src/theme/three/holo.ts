/**
 * Hologram styles: the marks the console projects above itself in FLIGHT, SHIP and MAP
 * (DECISIONS A8). Plain data, like `styles.ts`; build materials from these with `LineSet`
 * (src/view3d/gfx.ts) or the builders in this folder. The semantic styles (trail, forecast,
 * velocity, thrust...) stay in `lineStyles`; these are the hologram's own furniture.
 */
import { colour, opacity } from '../colour.ts';
import { dash, line } from '../line.ts';
import type { LineStyle } from './styles.ts';

const solid = (c: string, width: number, o = 1): LineStyle => ({ colour: c, width, opacity: o });
const dashed = (c: string, width: number, d: readonly [number, number], o = 1): LineStyle => ({
  colour: c,
  width,
  opacity: o,
  dash: d,
});

export const holoLines = {
  /** Rim of the projection volume at console level, and the mark for "ahead". */
  rim: solid(colour.inkDim, 1.2, 0.8),
  aheadTick: solid(colour.ink, 2.2),
  /** Level bearing ring around the ship. */
  bearingRing: solid(colour.inkDim, 1, 0.7),
  /** Centre of mass, its dotted axis, the nose tick, turn-rate arcs. */
  centreOfMass: solid(colour.ink, 1.5),
  comAxis: dashed(colour.ink, 1.2, dash.connector, 0.85),
  noseTick: solid(colour.ink, 2.6),
  rateArc: solid(colour.ink, 2.6),
  /** True position and hull of the ship, under the enlarged symbol. */
  trueHull: solid(colour.measured, line.shipFootprint, 0.9),
  /** A body's equator, and the bearing marker on the rim when it lies outside the volume. */
  bodyEquator: solid(colour.bodyRim, 1.5, 0.9),
  bodyBearing: solid(colour.bodyRim, 1.8),
  /** A tracked rock's forecast track (the model's, so teal) and a closest-approach ring. */
  objectTrack: dashed(colour.forecast, 1.3, dash.forecast, 0.75),
  approachRing: solid(colour.caution, 1.6),
  approachRingWarning: solid(colour.warning, 2),
  /** Uncertainty of a rock's believed position (2σ). */
  uncertainty: solid(colour.asteroid, 1, 0.45),
  /** Selection bracket around the object the camera is pointed at, or the cursor is on. */
  selection: solid(colour.ink, 1.4, 0.9),
  tracking: solid(colour.coverage, 1.6, 0.9),
  /** Objective gate: a region, a band edge, a departure shell. */
  objective: dashed(colour.ink, line.boundary, dash.boundary, 0.7),
  /** A draft forecast (previewed, not issued): the forecast line, fainter. */
  preview: dashed(colour.forecast, 1.4, dash.forecast, 0.55),
  /** An earlier issued forecast of this attempt, kept for comparison with the trail. */
  forecastOld: dashed(colour.forecast, 1.2, dash.forecast, 0.35),
  /**
   * The stretch of the issued forecast the ship has already flown (A18): still drawn, frozen,
   * so it can be held against the trail, but quieter than the stretch still ahead.
   */
  forecastPast: dashed(colour.forecast, 1.2, dash.forecast, 0.4),
  /** The second attempt in a two-attempt comparison (the first is `previousAttempt`). */
  compareB: solid(colour.ink, line.previousAttempt, 0.6),
  compareForecast: dashed(colour.blackbox, 1.2, dash.forecast, 0.5),
  /** Map: corridors flown, a lead's bearing, the reach of the propellant on board. */
  corridor: solid(colour.measured, 1.4, 0.8),
  lead: dashed(colour.ink, 1.2, dash.connector, 0.6),
  reach: dashed(colour.velocity, 1.1, dash.boundary, 0.5),
  /** Ship drawing: callout leaders, relationship lines between components, thrust arm. */
  leader: solid(colour.inkDim, 1, 0.7),
  relation: dashed(colour.ink, 1.1, dash.connector, 0.6),
} as const satisfies Record<string, LineStyle>;

/** One-pixel additive wireframes: opacity by what the thing is. */
export const holoWire = {
  /** Faint arcs over the top of the projection volume, and the projector's cone of light. */
  dome: 0.1,
  projector: 0.05,
  /** Stalks from an object to the reference plane. */
  stalk: 0.2,
  /** A body's meridians. */
  body: 0.16,
  /** Rocks: tracked now, and last seen. */
  rockLive: 0.95,
  rockStale: 0.3,
  /** Sensor cone from the nose. */
  sensorCone: 0.16,
  /** Forecast envelope tube (3D): rings where sampled, where extrapolated, inside a validated span. */
  tube: opacity.envelopeEdge,
  tubeExtrapolated: opacity.extrapolatedEdge,
  tubeValidated: opacity.validatedEdge,
  /** Bearing-ring ticks. */
  tick: 0.6,
  /** The ship symbol in the flight view, and a system's parts when isolated. */
  shipSymbol: 0.3,
  shipPart: 0.5,
  shipPartSelected: 1,
  /** Map: a charted region's bubble, unsurveyed haze. */
  region: 0.35,
  haze: 0.25,
  datum: 0.12,
} as const;

/** Sizes in hologram metres (the projection volume is about a metre across). */
export const holoSize = {
  /** Radius of the projection volume. */
  radius: 1.1,
  /** The ship sits this fraction of the radius back toward the player (A8). */
  setBack: 0.5,
  bearingRing: 0.4,
  /** Hologram metres per metre of hull for the enlarged ship symbol. */
  shipScale: 0.034,
  /** Smallest drawn rock, so a 1 km rock is still a mark at 1,000 km range. */
  rockMin: 0.012,
  /** Thrust chevron half-width and spacing. */
  chevron: 0.024,
  /** Velocity arrow: shortest, longest. */
  velocityMin: 0.12,
  velocityMax: 0.5,
  comRing: 0.014,
  selection: 0.05,
} as const;
