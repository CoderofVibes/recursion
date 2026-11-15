/**
 * MAP hologram: the expanse as the ship knows it, as a three-dimensional chart (DECISIONS A8).
 * Charted regions as bubbles of surveyed space standing on stalks over a datum plane, corridors
 * flown between them, leads as bearing cones, earlier attempts from Black Box, the reach of the
 * propellant on board, and a haze of points wherever the ship has not been.
 *
 * It draws the chart it is given and nothing else: there is no content here. The plate and the
 * chips are the host's (React); this exposes what is selected and tells listeners when it changes.
 * Where things go is `layout.ts`; how they look is the theme (Convention 11).
 */
import {
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Points,
  PointsMaterial,
  Ray,
  SphereGeometry,
  WireframeGeometry,
} from 'three';
import type { Material, Object3D, Raycaster } from 'three';
import type { Line2 } from 'three/addons/lines/Line2.js';
import { hex, holoLines, holoSize, lineStyles } from '../../theme/index.ts';
import type { LineStyle } from '../../theme/index.ts';
import { mapHaze, mapLines, mapMotion, mapWire } from '../../theme/three/map-holo.ts';
import type { WireStyle } from '../../theme/three/map-holo.ts';
import { LineSet, arcXZ, label, thin, toSegs } from '../gfx.ts';
import type { Tag } from '../gfx.ts';
import {
  MAP_GEOMETRY,
  hazeOutside,
  hazeScatter,
  layoutChart,
  leadConeWire,
  markAngle,
  markTexts,
  pickKey,
  pickTarget,
  pickTargets,
} from './layout.ts';
import type { Chart, ChartLayout, MapPick, PickTarget, Vec3 } from './layout.ts';

export type {
  Chart,
  ChartAttempt,
  ChartCorridor,
  ChartLead,
  ChartOutcome,
  ChartRegion,
  MapPick,
} from './layout.ts';

export interface MapHolo {
  /** Add under the hologram root; the host places and tilts it. */
  readonly group: Group;
  /** The host rotates and scales this on drag and wheel. */
  readonly spin: Group;
  /** Draw this chart. Rebuilds only when the chart actually changed (compared as JSON). */
  setChart(chart: Chart): void;
  /** The region or lead under a ray, nearest first. */
  pick(ray: Raycaster): MapPick | null;
  hover(target: MapPick | null): void;
  selected(): MapPick | null;
  select(target: MapPick | null): void;
  /** The selection changed. Returns unsubscribe. */
  onChange(listener: () => void): () => void;
  update(dt: number, time: number): void;
  setResolution(width: number, height: number): void;
  /** Screen pixels covered by one metre of the hologram's frame (keeps dashes in step). */
  setPixelsPerUnit(pixels: number): void;
  /** Frees everything it made, takes its tags off the page and its group out of the scene. */
  dispose(): void;
}

type Drawable = Object3D & { geometry: BufferGeometry; material: Material };

const TAU = Math.PI * 2;
const EMPTY: Chart = { regions: [], corridors: [], leads: [] };
/** The three great circles a sphere is drawn with: one level, two upright (rotation about x, z). */
const CIRCLES: readonly (readonly [number, number])[] = [
  [0, 0],
  [Math.PI / 2, 0],
  [0, Math.PI / 2],
];
const same = (a: MapPick | null, b: MapPick | null): boolean =>
  a === b || (a !== null && b !== null && a.kind === b.kind && a.id === b.id);

/**
 * @param options.radius Radius of the hologram volume, metres. Default: the theme's `holoSize.radius`.
 */
export function makeMapHolo(options: { radius?: number } = {}): MapHolo {
  const R = options.radius ?? holoSize.radius;
  const G = MAP_GEOMETRY;
  const datum = G.datum * R;
  const group = new Group();
  const spin = new Group();
  group.add(spin);

  // Two sets of fat lines in the one frame: the volume and the selection, made once, and the
  // chart, thrown away and remade when the chart changes.
  const frameLines = new LineSet();
  const chartLines = new LineSet();
  const wire = (flat: readonly number[], style: WireStyle) =>
    thin(flat, style.colour, style.opacity);

  // ---- The volume: a datum plane to read heights against, its rim, two arcs over the top -------
  const fixed: Drawable[] = [];
  const keep = <T extends Drawable>(o: T, parent: Object3D = spin): T => {
    parent.add(o);
    fixed.push(o);
    return o;
  };
  const grid: number[] = [];
  for (let i = -5; i <= 5; i++) {
    const x = (i * R) / 5.5;
    const h = Math.sqrt(R * R - x * x);
    grid.push(x, datum, -h, x, datum, h, -h, datum, x, h, datum, x);
  }
  keep(wire(grid, mapWire.datum));
  keep(frameLines.fat(arcXZ(R, 0, TAU, 128, datum), holoLines.rim));
  const dome: number[] = [];
  const foot = Math.asin(G.datum);
  const sweep = Math.PI - 2 * foot;
  for (let i = 0; i < 48; i++) {
    const a = foot + (sweep * i) / 48;
    const b = foot + (sweep * (i + 1)) / 48;
    dome.push(Math.cos(a) * R, Math.sin(a) * R, 0, Math.cos(b) * R, Math.sin(b) * R, 0);
    dome.push(0, Math.sin(a) * R, Math.cos(a) * R, 0, Math.sin(b) * R, Math.cos(b) * R);
  }
  keep(wire(dome, mapWire.dome)).rotation.y = 0.6;

  // ---- The chart: everything below is remade by `draw` -----------------------------------------
  const content = new Group();
  spin.add(content);
  const scatter = hazeScatter(R);
  const ball = new SphereGeometry(1, 12, 8);
  const ballWire = new WireframeGeometry(ball);
  const bubble = Array.from(ballWire.getAttribute('position').array);
  ball.dispose();
  ballWire.dispose();

  let drawn: Drawable[] = [];
  let tags: Tag[] = [];
  /** Name tags by pick key, so the selected one can be marked. */
  const named = new Map<string, Tag>();
  /** What the cursor can find, in the order drawn and by pick key. */
  let found: PickTarget[] = [];
  const targets = new Map<string, PickTarget>();
  let pulse: Line2 | null = null;

  function clear(): void {
    // A tag takes its element out of the page only when it is itself removed from its parent.
    for (const t of tags) t.removeFromParent();
    for (const d of drawn) {
      d.removeFromParent();
      d.geometry.dispose();
      d.material.dispose();
    }
    chartLines.dispose();
    drawn = [];
    tags = [];
    named.clear();
    found = [];
    targets.clear();
    pulse = null;
  }

  function draw(layout: ChartLayout): void {
    clear();
    found = pickTargets(layout, R);
    for (const t of found) targets.set(pickKey(t), t);
    const put = <T extends Drawable>(o: T): T => {
      content.add(o);
      drawn.push(o);
      return o;
    };
    const tag = (text: string, variant: string, at: Vec3, key?: string): void => {
      const t = label(text, variant);
      t.position.set(at[0], at[1], at[2]);
      content.add(t);
      tags.push(t);
      if (key !== undefined) named.set(key, t);
    };
    /** Many solid strokes in one object; nothing at all when there are none. */
    const strokes = (flat: readonly number[], style: LineStyle): void => {
      if (flat.length > 0) put(chartLines.fatSegs(flat, style));
    };
    const wires = (flat: readonly number[], style: WireStyle): void => {
      if (flat.length > 0) put(wire(flat, style));
    };

    // Unsurveyed space: a sparse haze of dim points everywhere the ship has not been.
    const haze = new BufferGeometry();
    haze.setAttribute('position', new Float32BufferAttribute(hazeOutside(scatter, layout, R), 3));
    const hazePoints = new Points(
      haze,
      new PointsMaterial({
        color: hex(mapHaze.colour),
        size: mapHaze.size,
        sizeAttenuation: false,
        transparent: true,
        opacity: mapHaze.opacity,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    );
    hazePoints.frustumCulled = false;
    put(hazePoints);

    // Regions: a bubble of surveyed space, how much of it is surveyed, a stalk to the datum.
    const bubbles: number[] = [];
    const equators: number[] = [];
    const surveyed: number[] = [];
    const stalks: number[] = [];
    const stalkHere: number[] = [];
    const feet: number[] = [];
    const ticks: number[] = [];
    for (const r of layout.regions) {
      const [x, y, z] = r.centre;
      for (let i = 0; i + 2 < bubble.length; i += 3)
        bubbles.push(
          x + bubble[i]! * r.radius,
          y + bubble[i + 1]! * r.radius,
          z + bubble[i + 2]! * r.radius,
        );
      equators.push(...toSegs(arcXZ(r.radius, 0, TAU, 64, y, x, z)));
      if (r.surveyed > 0) {
        const n = Math.max(2, Math.round(64 * r.surveyed));
        surveyed.push(...toSegs(arcXZ(r.radius, 0, TAU * r.surveyed, n, y, x, z)));
      }
      (r.current ? stalkHere : stalks).push(x, y, z, x, datum, z);
      feet.push(...toSegs(arcXZ(0.045 * R, 0, TAU, 32, datum, x, z)));
      tag(r.name, '', [x, y + r.radius + 0.045 * R, z], pickKey({ kind: 'region', id: r.id }));

      // Earlier attempts, from Black Box: a tick and a mark each, around the bubble.
      const texts = markTexts(r.marks);
      texts.forEach((text, i) => {
        const a = markAngle(i, texts.length);
        const out = (d: number): Vec3 => [
          x + Math.sin(a) * (r.radius + d * R),
          y,
          z - Math.cos(a) * (r.radius + d * R),
        ];
        ticks.push(...out(0.012), ...out(0.04));
        tag(text, 'bbx', out(0.09));
      });

      // You are here.
      if (r.current) {
        const ship = put(
          chartLines.fat(
            [0, 0, -0.027, 0.0135, 0, 0.018, -0.0135, 0, 0.018, 0, 0, -0.027].map((v) => v * R),
            mapLines.here,
          ),
        );
        ship.position.set(x, y, z);
        ship.rotation.y = -0.9;
        pulse = put(chartLines.fat(arcXZ(0.041 * R, 0, TAU, 40), mapLines.herePulse));
        pulse.position.set(x, y, z);
        if (r.marks.underway !== null)
          tag(`ATTEMPT ${r.marks.underway}`, 'sel', [x, y - 0.055 * R, z + 0.045 * R]);
      }
    }
    wires(bubbles, mapWire.bubble);
    strokes(equators, mapLines.regionRing);
    strokes(surveyed, mapLines.surveyed);
    wires(stalks, mapWire.stalk);
    wires(stalkHere, mapWire.stalkHere);
    strokes(feet, mapLines.stalkFoot);
    strokes(ticks, lineStyles.previousAttempt);

    const flown: number[] = [];
    for (const [a, b] of layout.corridors) flown.push(...a, ...b);
    strokes(flown, holoLines.corridor);

    // Leads: a bearing is a cone, not a place, until a second bearing crosses it.
    const bearings: number[] = [];
    const cones: number[] = [];
    for (const l of layout.leads) {
      bearings.push(...l.origin, ...l.end);
      cones.push(...leadConeWire(l));
      tag(
        l.name,
        '',
        [l.end[0], l.end[1] + 0.045 * R, l.end[2]],
        pickKey({ kind: 'lead', id: l.id }),
      );
    }
    strokes(bearings, holoLines.lead);
    wires(cones, mapWire.leadCone);

    // What the propellant on board can still reach from here.
    if (layout.reach) {
      const { centre, radius, clipped } = layout.reach;
      for (const [rx, rz] of CIRCLES) {
        const level = rx === 0 && rz === 0;
        const c = put(
          chartLines.fat(
            arcXZ(radius, 0, TAU, 96),
            level ? holoLines.reach : mapLines.reachUpright,
          ),
        );
        c.position.set(centre[0], centre[1], centre[2]);
        c.rotation.set(rx, 0, rz);
      }
      tag(clipped ? 'REACH BEYOND CHART' : 'REACH', 'dim', [
        centre[0] + 0.24 * radius,
        centre[1] - 0.19 * radius,
        centre[2] + 1.05 * radius,
      ]);
    }
  }

  // ---- Selection -------------------------------------------------------------------------------
  const bracket = (style: LineStyle): Group => {
    const g = new Group();
    for (const [rx, rz] of CIRCLES)
      keep(frameLines.fat(arcXZ(1, 0, TAU, 64), style), g).rotation.set(rx, 0, rz);
    g.visible = false;
    spin.add(g);
    return g;
  };
  const selectedRing = bracket(holoLines.selection);
  const hoverRing = bracket(mapLines.hover);
  let selection: MapPick | null = null;
  let hovered: MapPick | null = null;
  const listeners = new Set<() => void>();
  const emit = (): void => {
    for (const l of [...listeners]) l();
  };
  /** The target as this hologram holds it, or null when it is not on the chart. */
  const known = (t: MapPick | null): MapPick | null =>
    t !== null && targets.has(pickKey(t)) ? { kind: t.kind, id: t.id } : null;

  function restyle(): void {
    const rings: readonly (readonly [Group, MapPick | null])[] = [
      [selectedRing, selection],
      [hoverRing, same(hovered, selection) ? null : hovered],
    ];
    for (const [ring, pick] of rings) {
      const t = pick ? targets.get(pickKey(pick)) : undefined;
      ring.visible = t !== undefined;
      if (t) {
        ring.position.set(t.centre[0], t.centre[1], t.centre[2]);
        ring.scale.setScalar(t.ring);
      }
    }
    const key = selection ? pickKey(selection) : null;
    for (const [k, t] of named) t.element.classList.toggle('sel', k === key);
  }

  let chartKey = JSON.stringify(EMPTY);
  draw(layoutChart(EMPTY, R));

  const inverse = new Matrix4();
  const local = new Ray();

  return {
    group,
    spin,
    setChart(chart) {
      const key = JSON.stringify(chart);
      if (key === chartKey) return;
      chartKey = key;
      draw(layoutChart(chart, R));
      // What was selected or under the cursor may no longer be on the chart.
      hovered = known(hovered);
      const dropped = selection !== null && known(selection) === null;
      if (dropped) selection = null;
      restyle();
      if (dropped) emit();
    },
    pick(ray) {
      if (!group.visible || found.length === 0) return null;
      // Into the spin's own frame, so the host's placing, tilt, turn and zoom are all allowed for.
      spin.updateWorldMatrix(true, false);
      local.copy(ray.ray).applyMatrix4(inverse.copy(spin.matrixWorld).invert());
      return pickTarget(local, found);
    },
    hover(target) {
      const next = known(target);
      if (same(next, hovered)) return;
      hovered = next;
      restyle();
    },
    selected: () => selection,
    select(target) {
      const next = known(target);
      if (same(next, selection)) return;
      selection = next;
      restyle();
      emit();
    },
    onChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    update(_dt, time) {
      if (!pulse) return;
      const k = (time % mapMotion.pulsePeriod) / mapMotion.pulsePeriod;
      pulse.scale.setScalar(1 + k * mapMotion.pulseGrowth);
      pulse.material.opacity = mapLines.herePulse.opacity * (1 - k);
    },
    setResolution(width, height) {
      frameLines.setResolution(width, height);
      chartLines.setResolution(width, height);
    },
    setPixelsPerUnit(pixels) {
      frameLines.setPixelsPerUnit(pixels);
      chartLines.setPixelsPerUnit(pixels);
    },
    dispose() {
      clear();
      for (const d of fixed) {
        d.geometry.dispose();
        d.material.dispose();
      }
      frameLines.dispose();
      listeners.clear();
      group.removeFromParent();
    },
  };
}
