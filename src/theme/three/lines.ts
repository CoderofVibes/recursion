/**
 * Line materials built from the style table. Fat lines (`Line2` and `LineSegments2`) carry the
 * semantic styles: trail, forecast, velocity and so on. Thin additive lines carry hologram
 * wireframes. Owner: 1E, the UI lane.
 */
import { AdditiveBlending, Color, LineBasicMaterial, NormalBlending } from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { colour as tokens, hex, opacity } from '../colour.ts';
import { lineStyles } from './styles.ts';
import type { LineStyle } from './styles.ts';

export type LineStyleName = keyof typeof lineStyles;

export interface LineOptions {
  /** Holograms add light; marks on a lit surface should not. Default true. */
  readonly additive?: boolean;
}

/**
 * A fat-line material for one style. Width is in screen pixels. Dashes are in screen pixels too,
 * provided `dashScale` is kept at the number of pixels one world unit covers (see LineKit).
 */
export function lineMaterial(
  style: LineStyle,
  { additive = true }: LineOptions = {},
): LineMaterial {
  const m = new LineMaterial({
    color: hex(style.colour),
    linewidth: style.width,
    transparent: true,
    opacity: style.opacity,
    depthWrite: false,
    dashed: style.dash !== undefined,
    blending: additive ? AdditiveBlending : NormalBlending,
  });
  if (style.dash) {
    m.dashSize = style.dash[0];
    m.gapSize = style.dash[1];
  }
  return m;
}

/** Pixels covered by one world unit at `distance` from a perspective camera. */
export function pixelsPerUnit(
  fovDegrees: number,
  distance: number,
  viewportHeight: number,
): number {
  return viewportHeight / (2 * Math.max(distance, 1e-9) * Math.tan((fovDegrees * Math.PI) / 360));
}

/**
 * One material per style, made on demand and kept in step with the viewport.
 *
 *   const lines = new LineKit();
 *   const trail = new Line2(geometry, lines.get('trail'));
 *   // on resize:      lines.setResolution(width, height)
 *   // every frame:    lines.setPixelsPerUnit(pixelsPerUnit(camera.fov, distanceToTarget, height))
 */
export class LineKit {
  private readonly made = new Map<string, LineMaterial>();
  private width = 1;
  private height = 1;
  private scale = 1;
  private readonly options: LineOptions;

  constructor(options: LineOptions = {}) {
    this.options = options;
  }

  get(name: LineStyleName): LineMaterial {
    return this.from(name, lineStyles[name]);
  }

  /** A material for a style that is not in the table (a variant made by the caller). */
  from(key: string, style: LineStyle): LineMaterial {
    let m = this.made.get(key);
    if (!m) {
      m = lineMaterial(style, this.options);
      m.resolution.set(this.width, this.height);
      m.dashScale = this.scale;
      this.made.set(key, m);
    }
    return m;
  }

  setResolution(width: number, height: number): void {
    this.width = width;
    this.height = height;
    for (const m of this.made.values()) m.resolution.set(width, height);
  }

  /** Keep dash rhythm constant on screen as the camera moves. */
  setPixelsPerUnit(pxPerUnit: number): void {
    this.scale = pxPerUnit;
    for (const m of this.made.values()) m.dashScale = pxPerUnit;
  }

  dispose(): void {
    for (const m of this.made.values()) m.dispose();
    this.made.clear();
  }
}

export type WireRole = 'measured' | 'blackbox' | 'forecast' | 'body' | 'asteroid' | 'field';

const WIRE_COLOUR: Readonly<Record<WireRole, string>> = {
  measured: tokens.ink,
  blackbox: tokens.blackbox,
  forecast: tokens.forecast,
  body: tokens.bodyRim,
  asteroid: tokens.asteroid,
  field: tokens.lattice,
};

/**
 * One-pixel additive lines for hologram wireframes: the ship drawing, a body's lattice of
 * meridians, a ghosted hull. `level` scales the token opacity (1 = normal, less = further back).
 */
export function wireMaterial(role: WireRole = 'measured', level = 1): LineBasicMaterial {
  return new LineBasicMaterial({
    color: new Color(hex(WIRE_COLOUR[role])),
    transparent: true,
    opacity: opacity.wire * level,
    depthWrite: false,
    blending: AdditiveBlending,
  });
}

/** The faint outline left behind when a system is isolated in the ship view. */
export function ghostWireMaterial(role: WireRole = 'measured'): LineBasicMaterial {
  const m = wireMaterial(role);
  m.opacity = opacity.wireGhost;
  return m;
}
