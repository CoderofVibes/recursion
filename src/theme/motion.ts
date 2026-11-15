/**
 * Motion tokens. ms. Rules (docs/design/visual-direction.md § Motion):
 * nothing loops except live data and the Black Box lamp; alerts fade in once and stay steady;
 * time warp never speeds up interface motion.
 */
export const motion = {
  instant: 0,
  /** Hover, selection. */
  fast: 120,
  /** Panel state changes. */
  base: 200,
  /** Alert fade-in. Once, then steady. No blinking. */
  alertIn: 300,
  /** Damage flicker: two on/off cycles of this length, then a permanent mark. */
  flicker: 60,
  flickerCycles: 2,
  /** Success: brighten and settle. */
  settle: 600,
  /** Camera moves between framings. */
  camera: 450,
  /** Black Box record lamp: slow breathe, the one ambient loop. */
  breathe: 2400,
  easing: {
    out: 'cubic-bezier(0.2, 0.0, 0.0, 1.0)',
    inOut: 'cubic-bezier(0.4, 0.0, 0.2, 1.0)',
  },
  /** OrbitControls damping factor. */
  cameraDamping: 0.08,
  /**
   * Fastest a display may turn with the ship, rad/s. The window and a heading-up hologram follow
   * the ship's attitude, but time warp never speeds up interface motion: above this rate the
   * display lags the ship rather than spinning.
   */
  maxDisplayTurn: 0.35,
  /** How long the hands are off the flight controls before the coasting forecast is issued. */
  coastForecastDelay: 350,
} as const;
