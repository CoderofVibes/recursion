/**
 * Set dressing of the control room (DECISIONS A8): the stations, racks, plates, seats and lamps
 * that fill the compartment and carry no information. Plain data, read by
 * `src/view3d/room/dress.ts`. What the whole room shares stays in `room.ts` (screen glass and
 * bezel, panel grain and seams, the strip colour, how bright a lamp's material is); these are
 * the furniture's own values. The palette is still the owner's to tune (A8, open).
 */
export const roomDressing = {
  /**
   * Painted screens inset in desks, racks and overhead panels. They show nothing real: bars, a
   * trend, a scope, lines of text, dials and lamp cells, drawn once in ink or recorder orange.
   */
  screen: {
    /** Opacity of the quiet parts of a drawing; everything else is drawn at full strength. */
    barTrack: 0.25,
    grid: 0.3,
    /** A scope's inner rings and cross-hair. */
    graticule: 0.4,
    text: 0.6,
    cellOff: 0.18,
    /**
     * The screens light themselves. White, so the painting keeps its own colours; the intensity
     * is with the room fully lit.
     */
    emissive: '#ffffff',
    emissiveIntensity: 0.85,
    finish: { roughness: 0.35, metalness: 0.1 },
  },

  /** Painted plates on cabinets, racks, the ceiling and the deck. */
  plate: {
    /** Bare plate, its brushed grain (in `roomSurface.panelGrain`) and the dark border. */
    base: '#16110d',
    grainAlpha: 0.03,
    border: '#080605',
    /** Vent louvres: the slots, and the lit lip above each (in the grain colour). */
    ventSlot: '#060403',
    ventLipAlpha: 0.07,
    /** Access panel: fastener heads, and the stencilled label (in ink). */
    fastener: '#2e241a',
    stencilAlpha: 0.28,
    /** Deck grating over the walkway: the dark under it, and its bars. */
    grating: '#0a0806',
    gratingBar: '#231b14',
    /** Hazard strip over the hatch: muted chevrons on dark. */
    hazard: '#0c0a07',
    hazardStripe: '#7a5b22',
    finish: { roughness: 0.6, metalness: 0.5 },
  },

  /**
   * Fitted metal of the furniture, a step lighter than the room's ribs so it stands off the
   * walls: cabinet and rack bodies; the darker desks, canopies and seat frames; and the trim
   * (rails, pipes, spokes, edging).
   */
  metal: {
    body: { colour: '#1d1813', roughness: 0.5, metalness: 0.65 },
    dark: { colour: '#0f0c09', roughness: 0.55, metalness: 0.6 },
    trim: { colour: '#33281d', roughness: 0.4, metalness: 0.75 },
  },

  /** Crew seats: the leather of the cushions and backs. */
  seat: { colour: '#3b2416', roughness: 0.85, metalness: 0.05 },

  /**
   * Keys and indicator lamps (one instanced mesh). Each lamp is ink, or now and then recorder
   * orange, multiplied by one of these brightnesses.
   */
  lamps: {
    /** The shared material is white so each lamp's own colour shows. */
    base: '#ffffff',
    lit: 0.9,
    /** Unlit keys on the desks, overhead panels and console; on the window sill; unlit indicators. */
    keyIdle: 0.22,
    sillKeyIdle: 0.2,
    indicatorIdle: 0.15,
    /** Markers set into the deck between the dais rings. */
    daisMarker: 0.3,
  },

  /**
   * Self-lit strips and rings: brightness as a multiple of the colour, which is
   * `roomLights.strip` unless one is given here.
   */
  glow: {
    /** Toe strip under each wall station and the edge strip on each back rack. */
    edgeStrip: 0.5,
    /** Work light under each station's upper rack. */
    workLight: { colour: '#ffc890', glow: 0.55 },
    /** Ring round the hatch. */
    hatchRing: 0.6,
    /** Lane lines either side of the walkway from the hatch. */
    lane: { colour: '#d2491c', glow: 0.42 },
    /** Dais rings round the console: the inner one, and the fainter outer one. */
    daisRing: 0.5,
    daisRingOuter: 0.3,
  },

  /** The warm light over each wall station's desk. Distance in metres. */
  stationLight: { colour: '#ffd9a8', intensity: 2.4, distance: 4.5, decay: 2 },
} as const;
