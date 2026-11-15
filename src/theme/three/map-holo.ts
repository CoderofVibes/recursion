/**
 * MAP hologram styles: the marks of the chart that `holo.ts` does not already carry (2D).
 * Plain data shaped like `holo.ts`; the view that draws with them is `src/view3d/map/MapHolo.ts`.
 * Corridors, a lead's bearing, the level reach ring, the rim and the selection bracket stay in
 * `holoLines`; an earlier attempt's mark takes `lineStyles.previousAttempt` (Black Box orange).
 */
import { colour } from '../colour.ts';
import { holoLines, holoWire } from './holo.ts';
import type { LineStyle } from './styles.ts';

const solid = (c: string, width: number, o = 1): LineStyle => ({ colour: c, width, opacity: o });

export const mapLines = {
  /** A region's equator: the whole bubble, and over it the share surveyed so far. */
  regionRing: solid(colour.inkFaint, 1, 0.9),
  surveyed: solid(colour.ink, 1.6, 0.8),
  /** Where a region's stalk meets the datum plane. */
  stalkFoot: solid(colour.inkDim, 1, 0.8),
  /** The ship: its symbol, and the ring that pulses out from it. */
  here: solid(colour.ink, 2),
  herePulse: solid(colour.ink, 1.4),
  /** Reach: the two upright rings of its sphere, fainter than the level one (`holoLines.reach`). */
  reachUpright: { ...holoLines.reach, opacity: 0.22 },
  /** The cursor is on a region or a lead (the selected one takes `holoLines.selection`). */
  hover: solid(colour.ink, 1, 0.45),
} as const satisfies Record<string, LineStyle>;

/** A one-pixel additive wireframe: which ink, and how strong. */
export interface WireStyle {
  readonly colour: string;
  readonly opacity: number;
}

export const mapWire = {
  /** Grid of the datum plane, and the two arcs over the top of the volume. */
  datum: { colour: colour.ink, opacity: holoWire.datum },
  dome: { colour: colour.ink, opacity: holoWire.dome },
  /** A charted region's bubble. */
  bubble: { colour: colour.inkFaint, opacity: holoWire.region },
  /** Stalk from a region down to the datum plane; stronger under the region the ship is in. */
  stalk: { colour: colour.ink, opacity: holoWire.stalk },
  stalkHere: { colour: colour.ink, opacity: 0.5 },
  /** The spread of a lead's bearing: a cone, not a place. */
  leadCone: { colour: colour.ink, opacity: 0.3 },
} as const satisfies Record<string, WireStyle>;

/** Unsurveyed space: a haze of single points. `size` is screen px. */
export const mapHaze = { colour: colour.inkDim, opacity: holoWire.haze, size: 1.6 } as const;

/** The ring that pulses out from the ship: seconds per pulse, and how far it grows (× its radius). */
export const mapMotion = { pulsePeriod: 2.4, pulseGrowth: 1.2 } as const;
