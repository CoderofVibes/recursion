/**
 * The wells' funnels as the eye sees them through the window (A19: real, visible funnels, the
 * window's showpiece). An encounter can hold some 2,600 funnel sites, so they are not drawn
 * one object each (that would be thousands of draws and as many buffer rebuilds a frame):
 * every visible funnel goes into one shared line buffer, drawn once.
 *
 * Only light: each funnel arrives from the window channel as 3B's `well-optical-v1` (inertial
 * unit rays from the eye and a colour depth, a brightness, an observed phase), never a range or
 * a physical size (A3, P11). It is drawn on a presentation shell, as 3B's `makeOpticalFunnelView`
 * draws one, with its colours and brightness rule, so a lone funnel looks the same either way.
 *
 * - **Culling:** nothing the room's walls hide (outside the window's arc, with a margin for the
 *   funnel's own size); nothing unlit or not seen in this eye frame.
 * - **Level of detail:** a funnel keeps line segments in proportion to its apparent size; a
 *   distant one keeps an evenly spaced subset of its contour. Over the whole budget, the
 *   faintest go first.
 * - **Frame cost:** a rebuild walks tens of thousands of segments, a few milliseconds, so it is
 *   never done in one frame. It runs in short slices into a back buffer while the front one is
 *   shown, and the two swap when it is done. The buffers hold inertial directions and turn with
 *   the room, so the one shown stays true to the ship's attitude between rebuilds.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  LineBasicMaterial,
  LineSegments,
  Quaternion,
  Vector3,
} from 'three';
import { lineStyles, render } from '../../theme/index.ts';
import { wellColour } from '../../theme/three/index.ts';
import type { WindowField } from '../adapter.ts';
import type { WindowFunnelVisual } from '../fields/wells/funnel.ts';
import { WINDOW_ARC } from './layout.ts';

/** The window channel's kind for a well's light (3B's `WELL_VIEW_KIND`). */
export const FUNNEL_KIND = 'inverse-well';

export interface FunnelSkyOptions {
  /** Radius of the presentation shell, scene metres (not a distance to anything). */
  readonly displayRadius: number;
  // Budgets default to the theme's `render.windowFunnels`.
  /** Most line segments drawn in all; past it the faintest funnels are left out. */
  readonly maxSegments?: number;
  /** Segments a funnel keeps per degree of its apparent radius (level of detail). */
  readonly segmentsPerDegree?: number;
  /** Fewest segments any drawn funnel keeps, so a far one still reads as a funnel. */
  readonly minSegments?: number;
  /** Most rebuilds started a second. */
  readonly rebuildRate?: number;
  /** Real milliseconds of rebuild a frame may take; the rest carries to the next frame. */
  readonly sliceMs?: number;
  /**
   * Most of the real time rebuilds may take, over a rebuild and the rest after it: on a slow
   * machine the sky rebuilds less often rather than taking the simulation's time (A20).
   */
  readonly share?: number;
}

export interface FunnelSkyStats {
  /** Funnels in the channel, culled by the walls or the light, thinned by size, drawn. */
  readonly offered: number;
  readonly culled: number;
  readonly thinned: number;
  readonly drawn: number;
  readonly segments: number;
}

export interface FunnelSky {
  /** Add to the window's inertial group (the one that turns with the room). */
  readonly object: Group;
  /**
   * Feed this frame's window channel. `roomFromInertial` turns an inertial scene direction
   * into the room's frame, where the window looks along −z. Returns what is shown now.
   */
  update(
    fields: readonly WindowField[],
    t: number,
    roomFromInertial: Quaternion,
    /** Real ms (performance.now()); the rebuild rate is counted in it. */
    now?: number,
  ): FunnelSkyStats;
  dispose(): void;
}

const DEG = Math.PI / 180;
/** Rays sampled per funnel to find its direction and apparent size. */
const SAMPLES = 8;
const GOLDEN = (Math.sqrt(5) - 1) / 2;
/** Funnels sized between looks at the clock in the first pass. */
const SIZING_CHUNK = 32;
const NOTHING: FunnelSkyStats = { offered: 0, culled: 0, thinned: 0, drawn: 0, segments: 0 };

interface Buffer {
  readonly positions: Float32Array;
  readonly colours: Float32Array;
  readonly position: BufferAttribute;
  readonly colour: BufferAttribute;
  readonly lines: LineSegments;
}

interface Kept {
  readonly v: WindowFunnelVisual;
  readonly step: number;
  readonly weight: number;
}

/** A rebuild in progress: the channel as it was when it began, and how far it has got. */
interface Build {
  readonly fields: readonly WindowField[];
  readonly t: number;
  readonly kept: Kept[];
  sorted: boolean;
  cursor: number;
  /** Real milliseconds spent on it so far. */
  spent: number;
  offered: number;
  culled: number;
  thinned: number;
  drawn: number;
  n: number;
}

export function makeFunnelSky(options: FunnelSkyOptions): FunnelSky {
  const radius = options.displayRadius;
  const budget = render.windowFunnels;
  const maxSegments = options.maxSegments ?? budget.maxSegments;
  const perDegree = options.segmentsPerDegree ?? budget.segmentsPerDegree;
  const minSegments = options.minSegments ?? budget.minSegments;
  const rebuildRate = options.rebuildRate ?? budget.rebuildRate;
  const sliceMs = options.sliceMs ?? budget.sliceMs;
  const share = options.share ?? budget.share;
  const material = new LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const makeBuffer = (): Buffer => {
    const positions = new Float32Array(maxSegments * 6);
    const colours = new Float32Array(maxSegments * 6);
    const position = new BufferAttribute(positions, 3);
    const colour = new BufferAttribute(colours, 3);
    position.setUsage(DynamicDrawUsage);
    colour.setUsage(DynamicDrawUsage);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', position);
    geometry.setAttribute('color', colour);
    geometry.setDrawRange(0, 0);
    const lines = new LineSegments(geometry, material);
    lines.frustumCulled = false;
    lines.renderOrder = render.renderOrder.onPlane;
    lines.visible = false;
    return { positions, colours, position, colour, lines };
  };
  const buffers = [makeBuffer(), makeBuffer()] as const;
  let front = 0;
  const object = new Group();
  object.add(buffers[0].lines, buffers[1].lines);

  const mean = new Vector3();
  const samples = Array.from({ length: SAMPLES }, () => new Vector3());
  const room = new Vector3();
  const mouth = new Color();
  const throat = new Color();
  const halfArc = (WINDOW_ARC / 2) * DEG;
  let startedAt = -Infinity;
  /** When the next rebuild may start, for the share of time (`now` clock). */
  let restUntil = -Infinity;
  let build: Build | undefined;
  let shown = NOTHING;

  /** An inertial unit ray (game frame) into `out` in scene axes; false unless a unit vector. */
  const ray = (r: { x: number; y: number; z: number } | undefined, out: Vector3): boolean => {
    if (!r) return false;
    const { x, y, z } = r;
    // Squared length within 2e-6 of 1 is length within 1e-6 (Math.hypot is slow at this rate).
    if (!(Math.abs(x * x + y * y + z * z - 1) <= 2e-6)) return false;
    out.set(x, z, -y);
    return true;
  };

  /**
   * Pass 1, per funnel and never per segment: is it seen now, which way, how big, how much of
   * it to keep. Direction and size come from a few sampled rays.
   */
  const size = (b: Build, field: WindowField, roomFromInertial: Quaternion): void => {
    if (field.kind !== FUNNEL_KIND) return;
    b.offered++;
    const v = field.visual as Partial<WindowFunnelVisual> | null;
    // An eye frame is instantaneous: not seen now, or unlit, is not drawn.
    if (
      !v ||
      v.schema !== 'well-optical-v1' ||
      v.visible !== true ||
      !(typeof v.brightness === 'number' && v.brightness > 0 && v.brightness <= 1) ||
      v.observedAt !== b.t ||
      !Array.isArray(v.segments) ||
      v.segments.length === 0
    ) {
      b.culled++;
      return;
    }
    const segments = v.segments;
    // Golden-ratio picks, so a regular contour (rings × meridians) never aliases them all onto
    // one side of the funnel.
    mean.set(0, 0, 0);
    let sampled = 0;
    for (let k = 0; k < SAMPLES; k++) {
      const s = segments[Math.floor(((k * GOLDEN) % 1) * segments.length)];
      if (!s || !ray(s.from, samples[sampled]!)) continue;
      mean.add(samples[sampled++]!);
    }
    if (mean.lengthSq() < 1e-12) {
      b.culled++;
      return;
    }
    mean.normalize();
    // Apparent radius from the same rays (the widest by dot product, one acos), with a margin
    // for the rays not sampled.
    let widest = 1;
    for (let i = 0; i < sampled; i++) widest = Math.min(widest, mean.dot(samples[i]!));
    const extent = 1.2 * Math.acos(Math.max(-1, Math.min(1, widest)));
    // Behind the walls: outside the window's arc by more than the funnel's own size.
    room.copy(mean).applyQuaternion(roomFromInertial);
    if (Math.abs(Math.atan2(room.x, -room.z)) - extent > halfArc) {
      b.culled++;
      return;
    }
    const keep = Math.max(minSegments, Math.ceil((extent / DEG) * perDegree));
    const step = Math.max(1, Math.ceil(segments.length / keep));
    if (step > 1) b.thinned++;
    b.kept.push({ v: v as WindowFunnelVisual, step, weight: v.brightness * extent });
  };

  /**
   * Pass 2: one kept funnel's segments into the back buffer, checking only those drawn. A
   * funnel with a malformed drawn segment is dropped whole (3B: malformed light is not sight).
   */
  const write = (b: Build, { v, step }: Kept, into: Buffer): void => {
    const segments = v.segments;
    if (b.n + Math.ceil(segments.length / step) > maxSegments) {
      b.culled++;
      return;
    }
    // The theme's colour rule is linear in depth over [0, 1]: take it at the mouth and the
    // throat once, then interpolate per segment.
    const k = lineStyles.wellMouth.opacity * v.brightness;
    wellColour(0, mouth).multiplyScalar(k);
    wellColour(1, throat).multiplyScalar(k);
    const r0 = mouth.r;
    const g0 = mouth.g;
    const b0 = mouth.b;
    const dr = throat.r - r0;
    const dg = throat.g - g0;
    const db = throat.b - b0;
    const { positions, colours } = into;
    let n = b.n;
    for (let i = 0; i < segments.length; i += step) {
      const s = segments[i];
      const p = s?.from;
      const q = s?.to;
      const d = s?.depth ?? NaN;
      if (!p || !q || !(d >= 0 && d <= 1)) {
        b.culled++;
        return;
      }
      // The unit checks and the game-to-scene turn (x, y, z) → (x, z, −y) of `ray`, inline.
      const { x: px, y: py, z: pz } = p;
      const { x: qx, y: qy, z: qz } = q;
      if (
        !(Math.abs(px * px + py * py + pz * pz - 1) <= 2e-6) ||
        !(Math.abs(qx * qx + qy * qy + qz * qz - 1) <= 2e-6)
      ) {
        b.culled++;
        return;
      }
      const o = n * 6;
      positions[o] = px * radius;
      positions[o + 1] = pz * radius;
      positions[o + 2] = -py * radius;
      positions[o + 3] = qx * radius;
      positions[o + 4] = qz * radius;
      positions[o + 5] = -qy * radius;
      colours[o] = colours[o + 3] = r0 + dr * d;
      colours[o + 1] = colours[o + 4] = g0 + dg * d;
      colours[o + 2] = colours[o + 5] = b0 + db * d;
      n++;
    }
    b.n = n;
    b.drawn++;
  };

  /** Show the back buffer and keep the old front for the next rebuild. */
  const swap = (b: Build): void => {
    const back = buffers[1 - front]!;
    back.lines.geometry.setDrawRange(0, b.n * 2);
    // Upload only what was written, not the whole budget.
    for (const attribute of [back.position, back.colour]) {
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, b.n * 6);
      attribute.needsUpdate = true;
    }
    back.lines.visible = b.n > 0;
    buffers[front]!.lines.visible = false;
    front = 1 - front;
    const { offered, culled, thinned, drawn, n } = b;
    shown = { offered, culled, thinned, drawn, segments: n };
  };

  return {
    object,
    update(fields, t, roomFromInertial, now = performance.now()) {
      if (!build) {
        if (now - startedAt < 1000 / rebuildRate || now < restUntil) return shown;
        startedAt = now;
        build = {
          fields,
          t,
          kept: [],
          sorted: false,
          cursor: 0,
          spent: 0,
          offered: 0,
          culled: 0,
          thinned: 0,
          drawn: 0,
          n: 0,
        };
      }
      const b = build;
      const began = performance.now();
      const deadline = began + sliceMs;
      const pause = (): FunnelSkyStats => {
        b.spent += performance.now() - began;
        return shown;
      };
      while (!b.sorted) {
        const end = Math.min(b.fields.length, b.cursor + SIZING_CHUNK);
        for (; b.cursor < end; b.cursor++) size(b, b.fields[b.cursor]!, roomFromInertial);
        if (b.cursor >= b.fields.length) {
          // Over the budget, the faintest and smallest go first.
          b.kept.sort((x, y) => y.weight - x.weight);
          b.sorted = true;
          b.cursor = 0;
        }
        if (performance.now() >= deadline) return pause();
      }
      const back = buffers[1 - front]!;
      while (b.cursor < b.kept.length) {
        write(b, b.kept[b.cursor++]!, back);
        if (b.cursor < b.kept.length && performance.now() >= deadline) return pause();
      }
      swap(b);
      pause();
      restUntil = now + (b.spent * (1 - share)) / share;
      build = undefined;
      return shown;
    },
    dispose() {
      for (const { lines } of buffers) lines.geometry.dispose();
      material.dispose();
    },
  };
}
