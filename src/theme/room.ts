/**
 * The control room (DECISIONS A8): its surfaces, lights and the loss sequence. Plain data.
 * Layout (dimensions, camera poses) belongs to the room scene in `src/view3d/room/`; how the
 * room looks belongs here. The palette is still the owner's to tune (A8, open).
 */
import { colour } from './colour.ts';

/** Surfaces. Canvas textures are painted from these; materials are built from them. */
export const roomSurface = {
  /** Behind everything, and the loss screen. */
  void: '#000000',
  /** Wall and ceiling panels: base, seams between panels, rivet heads, brushed grain. */
  panel: '#1d1711',
  panelSeam: '#0a0705',
  panelRivet: '#2c2219',
  panelGrain: '#ffdcaa',
  panelGrainAlpha: 0.028,
  /** Deck plates. */
  deck: '#15110d',
  deckSeam: '#070504',
  deckRivet: '#261d15',
  deckGrain: '#ffe6be',
  deckGrainAlpha: 0.03,
  /** Dark fitted metal: ribs, racks, pedestals, seat frames. */
  metal: '#14100c',
  /** The console's top slab and the window frame. */
  slab: '#1a140e',
  frame: '#0d0a08',
  /** Window glass: a faint warm sheen, almost nothing. */
  glass: '#ffe2c4',
  glassAlpha: 0.007,
  /** Inset wall screens (set dressing): glass, bezel. */
  screen: '#060403',
  screenBezel: '#2b2118',
  /** Seat cushions and soft trim. */
  fabric: '#221a12',
  /** Black Box recorder casing and the lettering stencilled on it. */
  recorder: '#b4520f',
  recorderEmissive: '#2a1003',
  recorderInk: '#1a0d04',
  /** Console pads: label when idle and when the cursor is on it. */
  padInk: colour.inkDim,
  padInkHot: colour.ink,
  padBack: '#0b0806',
  padEdge: colour.panelEdge,
  /** The projector well in the middle of the console's top. */
  well: '#050403',
} as const;

/** Material finish (roughness, metalness) by kind of surface. */
export const roomFinish = {
  panel: { roughness: 0.8, metalness: 0.3 },
  deck: { roughness: 0.62, metalness: 0.45 },
  ceiling: { roughness: 0.9, metalness: 0.3 },
  metal: { roughness: 0.55, metalness: 0.55 },
  slab: { roughness: 0.42, metalness: 0.65 },
  frame: { roughness: 0.45, metalness: 0.7 },
  recorder: { roughness: 0.5, metalness: 0.25 },
  fabric: { roughness: 0.95, metalness: 0.05 },
} as const;

/** Lights. Intensities are Three.js point-light units at the room's scale (metres). */
export const roomLights = {
  warm: '#ffb070',
  strip: '#ff9a40',
  door: '#ffa050',
  ambient: '#2e241a',
  hologram: '#f1e4cc',
  intensity: {
    ceiling: 9,
    door: 5,
    underConsole: 2.2,
    window: 10,
    hologram: 2.2,
    ambient: 0.85,
    recorder: 0.5,
  },
  /** Reach of each light, metres. */
  distance: { ceiling: 9, door: 7, underConsole: 5, window: 12, hologram: 6, recorder: 2.5 },
  /** Brightness of self-lit strips, as a multiple of their colour. */
  glow: { ceilingBar: 0.75, floorStrip: 0.5, underConsole: 0.55, sill: 0.45, lamp: 1 },
  /** Lit console pads and screen when idle, hovered, and with the room dimmed. */
  pad: { idle: 0.72, hot: 1.5 },
  consoleScreen: 0.75,
  projectorRing: 0.9,
} as const;

/** Bloom for the room scene: tighter than the sensor view's, so lamps glow and panels do not. */
export const roomBloom = { strength: 0.4, radius: 0.4, threshold: 0.3 } as const;

/** Stars and the outside, seen through the window by eye (P11: no sensors involved). */
export const outsideStyle = {
  starCount: 3200,
  starSize: 1.7,
  /** Dimmest and brightest star, 0–1; warm tint range. */
  starMin: 0.16,
  starWarm: [0.86, 0.68],
  /** A rock's sunlit colour through the window. */
  rock: '#8f7d66',
  /** The secondary's sunlit face (cooler than the primary's). */
  bodyLitCool: '#6f7f86',
} as const;

/**
 * Loss of the ship (A8, A9): shake and flicker, cut to black, one orange pip, back at the door.
 * Seconds from the moment of loss. About 6 s end to end (owner may change).
 */
export const lossSequence = {
  shakeEnd: 1.5,
  /** The hologram dies a little before the room does. */
  hologramEnd: 1.1,
  pipAt: 2.3,
  resetAt: 3.6,
  fadeAt: 4.4,
  end: 6.0,
  /** Peak vertical shake, metres, and roll, radians. */
  shake: 0.075,
  roll: 0.022,
} as const;

/** Walking and looking. */
export const roomMotion = {
  /** m/s. */
  walk: 2.5,
  /** rad/s with the arrow keys. */
  turn: 1.6,
  /** Seconds for the camera to travel between the room and a console view. */
  travel: 0.8,
  /** Rate the room's light level, veil and hologram ease toward a view's values, 1/s. */
  ease: 5,
  /** Radians per pixel: pointer-locked look, and drag-to-look. */
  look: 0.0021,
  dragLook: 0.004,
  /** One press of a framing key or button on a hologram: range factor, orbit and tilt, rad. */
  frameZoom: 1.25,
  frameOrbit: 0.2,
  frameTilt: 0.08,
} as const;
