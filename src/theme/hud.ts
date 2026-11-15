/**
 * Overlays drawn over the room: the cursor, hologram tags, the plates and key caps beside a
 * hologram, the console's screen when it takes over the view, and the loss screen. px unless
 * noted. One place to tune how dense and how close to the edge the overlays sit.
 */
import { colour, rgba } from './colour.ts';
import { roomSurface } from './room.ts';

export const hud = {
  /** Distance of overlays from the screen edge, and from its top below the view's title. */
  margin: 28,
  top: 64,
  /** Side columns beside the SHIP hologram and the flight view's panels. */
  column: 326,
  /** The MAP's plate and the flight view's object plate. */
  plate: 318,
  /** Flight key caps. */
  key: 62,
  keyHeight: 40,
  /** The cursor: a dot at rest, a ring when it has found something. */
  reticle: 4,
  reticleHot: 18,
  /** Black Box's pip on the loss screen. */
  pip: 7,
  /** Padding around the console's screen when it takes over the view. */
  screenPad: 26,
  /** Width of the console's side rail (pages), and of a narrow panel column. */
  rail: 148,
  /** Height of a plotted panel (strength against distance, a comparison strip). */
  plot: 190,
  /** Minimum width of one panel in the console's grid. */
  panelMin: 300,
} as const;

/** Colours of overlay surfaces and glows (CSS strings). */
export const hudSurface = {
  /** Plates and key caps over the 3D scene: the panel colour, let through a little. */
  plate: rgba(colour.table, 0.84),
  plateSoft: rgba(colour.panel, 0.72),
  /** Phosphor glow behind tags, by tone. */
  glowInk: `0 0 6px ${rgba(colour.ink, 0.35)}`,
  glowForecast: `0 0 6px ${rgba(colour.forecast, 0.4)}`,
  glowBlackbox: `0 0 6px ${rgba(colour.blackbox, 0.45)}`,
  glowThrust: `0 0 10px ${rgba(colour.thrust, 0.25)}`,
  /** The red frame at the moment of loss. */
  hit: `inset 0 0 0 3px ${colour.warning}, inset 0 0 90px ${rgba(colour.warning, 0.35)}`,
  /** Vignette of the console's screen. */
  screenVignette: `radial-gradient(120% 120% at 50% 50%, ${colour.viewBackground} 60%, ${roomSurface.void} 100%)`,
  screenInset: `inset 0 0 0 5px ${colour.tableLip}, inset 0 0 80px ${rgba(roomSurface.void, 0.6)}`,
} as const;

/** Overlay opacities, 0–1. */
export const hudOpacity = {
  /** The cursor's dot at rest, and its ring when it has found something. */
  reticle: 0.75,
  reticleHot: 0.95,
  /** Low point of the two-cycle flicker at the moment of loss. */
  flicker: 0.2,
} as const;

/** Overlay timings, ms. */
export const hudMotion = {
  /** The console's screen coming up once the camera arrives. */
  screenIn: 260,
  /** The loss screen lifting to show the room again. */
  lossFade: 1500,
  /** Black Box's pip appearing on the loss screen. */
  pipIn: 500,
} as const;
