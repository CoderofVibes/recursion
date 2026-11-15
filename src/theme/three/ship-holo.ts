/**
 * Ship hologram: how bright each kind of drawn part is in the overview and when a system is
 * isolated, and how fast the drawing moves (DECISIONS A8). Plain data, like `holo.ts`; the line
 * styles the ship drawing uses (centre of mass, leaders, thrust line, footprint) are already in
 * `holoLines` and `lineStyles`.
 */
import { opacity } from '../colour.ts';
import { holoWire } from './holo.ts';

/** One-pixel additive wire opacity for a part of the ship drawing, by what the part is. */
export const shipWire = {
  /** Overview of the whole vehicle: the pressure hull stays behind what it contains. */
  overviewHull: 0.26,
  /** Overview: assemblies on the outside, and those inside the hull. */
  overviewExterior: opacity.wire,
  overviewInterior: 0.25,
  /** Overview: ring frames and deck, there for depth only. */
  overviewFaint: 0.1,
  /** Overview: the Black Box, always findable. */
  overviewBlackBox: 0.9,
  /** A system isolated: its parts, and the same parts while another one of them is selected. */
  isolatedPart: 0.82,
  isolatedBeside: 0.42,
  /** A system isolated: its pipes, harness and links. */
  isolatedNetwork: 0.42,
  isolatedFaint: 0.25,
  /** Everything outside the isolated system. */
  ghost: opacity.wireGhost,
  /** The part under the cursor, or selected. */
  hot: holoWire.shipPartSelected,
  /** Ring frames and deck against the rest when the host sets one opacity for the whole drawing. */
  faintLevel: 0.3,
} as const;

/** Motion of the ship drawing. Display only: neither follows the ship's real transition times. */
export const shipHoloMotion = {
  /** Seconds for radiators or solar wings to run fully out or in on the drawing. */
  deploy: 1.8,
  /** Rate the drawing eases toward the framing of an isolated system, 1/s. */
  frame: 4.5,
} as const;
