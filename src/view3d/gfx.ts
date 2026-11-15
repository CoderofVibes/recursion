/**
 * Small drawing helpers shared by the room and the holograms. Every colour, width, dash and
 * opacity arrives as a theme style (`LineStyle`, a colour role, a `holoWire` opacity); nothing
 * here chooses how a thing looks (Convention 11).
 */
import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
  SRGBColorSpace,
} from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import type { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { hex } from '../theme/index.ts';
import type { LineStyle } from '../theme/index.ts';
import { lineMaterial } from '../theme/three/index.ts';

export interface DrawOptions {
  /** Render order among transparent layers (theme `render.renderOrder`). */
  readonly order?: number;
  /** Holograms add light; marks on a lit surface should not. Default true. */
  readonly additive?: boolean;
}

/** A degenerate two-point line, for a mark that has nothing to show yet. */
const EMPTY: readonly number[] = [0, 0, 0, 0, 0, 1e-6];
const usable = (flat: readonly number[], min: number): number[] =>
  flat.length >= min ? (flat as number[]) : [...EMPTY];

/**
 * Fat lines that share one frame of reference: one projection scale, so their dashes keep their
 * rhythm in screen pixels. Make one set per group whose scale differs (the hologram's own frame,
 * the environment drawn inside it, the ship drawing).
 *
 *   const lines = new LineSet();
 *   group.add(lines.fat(points, lineStyles.trail));
 *   // on resize:   lines.setResolution(width, height)
 *   // each frame:  lines.setPixelsPerUnit(pixels one local unit covers)
 */
export class LineSet {
  private readonly materials = new Set<LineMaterial>();
  private width = 1;
  private height = 1;
  private scale = 1;

  /** A material of its own, so one line's opacity or visibility can change without the others'. */
  material(style: LineStyle, additive = true): LineMaterial {
    const m = lineMaterial(style, { additive });
    m.resolution.set(this.width, this.height);
    m.dashScale = this.scale;
    this.materials.add(m);
    return m;
  }

  /** A polyline through `flat` (x, y, z, x, y, z...). */
  fat(flat: readonly number[], style: LineStyle, options: DrawOptions = {}): Line2 {
    const g = new LineGeometry();
    g.setPositions(usable(flat, 6));
    const l = new Line2(g, this.material(style, options.additive ?? true));
    l.computeLineDistances();
    l.frustumCulled = false;
    if (options.order !== undefined) l.renderOrder = options.order;
    return l;
  }

  /** Separate segments: `flat` holds pairs of points. */
  fatSegs(flat: readonly number[], style: LineStyle, options: DrawOptions = {}): LineSegments2 {
    const g = new LineSegmentsGeometry();
    g.setPositions(usable(flat, 6));
    const l = new LineSegments2(g, this.material(style, options.additive ?? true));
    l.computeLineDistances();
    l.frustumCulled = false;
    if (options.order !== undefined) l.renderOrder = options.order;
    return l;
  }

  setResolution(width: number, height: number): void {
    this.width = width;
    this.height = height;
    for (const m of this.materials) m.resolution.set(width, height);
  }

  /** Screen pixels covered by one unit of the frame these lines are drawn in. */
  setPixelsPerUnit(pixels: number): void {
    this.scale = pixels;
    for (const m of this.materials) m.dashScale = pixels;
  }

  dispose(): void {
    for (const m of this.materials) m.dispose();
    this.materials.clear();
  }
}

/** Replace a fat polyline's points (rebuilds the geometry; fine for a few lines a frame). */
export function setFat(l: Line2, flat: readonly number[]): void {
  l.geometry.dispose();
  const g = new LineGeometry();
  g.setPositions(usable(flat, 6));
  l.geometry = g;
  l.computeLineDistances();
}

export function setFatSegs(l: LineSegments2, flat: readonly number[]): void {
  l.geometry.dispose();
  const g = new LineSegmentsGeometry();
  g.setPositions(usable(flat, 6));
  l.geometry = g;
  l.computeLineDistances();
}

/** One-pixel additive line segments, for wireframes. `colour` is a theme colour. */
export function thin(
  flat: readonly number[],
  colour: string,
  opacity: number,
  order?: number,
): LineSegments<BufferGeometry, LineBasicMaterial> {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(usable(flat, 6), 3));
  const l = new LineSegments(
    g,
    new LineBasicMaterial({
      color: hex(colour),
      transparent: true,
      opacity,
      depthWrite: false,
      blending: AdditiveBlending,
    }),
  );
  l.frustumCulled = false;
  if (order !== undefined) l.renderOrder = order;
  return l;
}

export function setThin(l: LineSegments, flat: readonly number[]): void {
  l.geometry.setAttribute('position', new Float32BufferAttribute(usable(flat, 6), 3));
}

/** Circle (or arc) in the XZ plane as a flat point list. Angle 0 points to -z, positive toward +x. */
export function arcXZ(
  r: number,
  a0 = 0,
  a1 = Math.PI * 2,
  n = 96,
  y = 0,
  cx = 0,
  cz = 0,
): number[] {
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push(cx + Math.sin(a) * r, y, cz - Math.cos(a) * r);
  }
  return out;
}

/** Turn a polyline point list into a segment list. */
export function toSegs(flat: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i + 5 < flat.length; i += 3)
    out.push(flat[i]!, flat[i + 1]!, flat[i + 2]!, flat[i + 3]!, flat[i + 4]!, flat[i + 5]!);
  return out;
}

/** A hologram tag: text that follows a point in the scene. Styled by `.rx-tag` (control-room.css). */
export type Tag = CSS2DObject & { element: HTMLElement };

export function label(text: string, variant = ''): Tag {
  const el = document.createElement('div');
  el.className = `rx-tag ${variant}`.trim();
  el.textContent = text;
  return new CSS2DObject(el) as Tag;
}

/** Set a tag's text only when it changed (text nodes are cheap; layout is not). */
export function setTag(tag: Tag, text: string): void {
  if (tag.element.textContent !== text) tag.element.textContent = text;
}

/** A texture painted on a 2D canvas. */
export function canvasTex(
  w: number,
  h: number,
  draw: (x: CanvasRenderingContext2D, w: number, h: number) => void,
): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d');
  if (x) draw(x, w, h);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export const ease = (x: number): number => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
export const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));

/** A small repeatable generator for set dressing (never for anything the game depends on). */
export function dressingRandom(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
