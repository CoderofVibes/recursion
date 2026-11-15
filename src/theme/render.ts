/** 3D materials and lighting for the sensor view. Plain data; no Three.js import. */
export const render = {
  /** UnrealBloomPass: a soft phosphor glow, not a haze. */
  bloom: { strength: 0.55, radius: 0.35, threshold: 0.12 },
  /** Exponential-squared fog density (world units ≈ m after 2E's scale). Tune with the scene scale. */
  fogDensity: 0.0042,
  /** Direction of the key light on massive bodies (world, y up). */
  keyLight: [-0.6, 0.5, -0.4],
  /** Fresnel rim on massive bodies. */
  rimStrength: 0.55,
  rimPower: 2.6,
  /** Ship symbol: drawn at true size up close, enlarged (never shrunk) when the camera pulls back. */
  shipSymbol: { minScale: 1, maxScale: 4, distancePerScale: 70 },
  /** Elevation of the default oblique view of the flight plane, degrees. */
  defaultElevation: 55,
  /** Order of transparent layers: below-plane structures, plane, on-plane marks, above. */
  renderOrder: {
    belowPlane: -20,
    plane: -10,
    envelope: 1,
    onPlane: 2,
    abovePlane: 4,
    shipMarks: 5,
  },
  /** Lattice reconstruction shading. */
  lattice: {
    /** Strand half-width at full processing quality, world units; triples at zero quality. */
    strandWidth: 0.32,
    sheetGain: 0.2,
    planeCutGain: 0.75,
  },
  /** Well funnel shading: brightness falls with depth below the plane. */
  well: { depthFalloff: 0.7, rings: 30, meridians: 12 },
  /**
   * The wells as the window shows them (2D's funnel sky): every funnel the eye sees in one
   * shared buffer, budgeted for some 2,600 sites. Segments in all (past it the faintest go),
   * per degree of a funnel's apparent radius, the fewest a far one keeps, rebuilds started a
   * second, real milliseconds of rebuild a frame (the rest carries over; the buffer shown turns
   * with the room meanwhile, so it never lags the ship's attitude), and the most of real time
   * rebuilds take (a slow machine rebuilds less often instead of slowing the simulation).
   */
  windowFunnels: {
    maxSegments: 60_000,
    segmentsPerDegree: 24,
    minSegments: 12,
    rebuildRate: 15,
    sliceMs: 2,
    share: 0.1,
  },
} as const;
