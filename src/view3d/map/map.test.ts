import { Ray, Raycaster, Vector3 } from 'three';
import type { Object3D } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { holoSize } from '../../theme/index.ts';
import { makeMapHolo } from './MapHolo.ts';
import type { Chart, ChartRegion } from './MapHolo.ts';
import {
  MAP_GEOMETRY,
  MARK_LIMIT,
  hazeOutside,
  hazeScatter,
  layoutChart,
  leadConeWire,
  markAngle,
  markTexts,
  pickTarget,
  pickTargets,
  selectMarks,
} from './layout.ts';
import type { Vec3 } from './layout.ts';

const R = holoSize.radius;
const G = MAP_GEOMETRY;

const region = (id: string, over: Partial<ChartRegion> = {}): ChartRegion => ({
  id,
  name: id.toUpperCase(),
  position: [0, 0, 0],
  radius: 1,
  surveyed: 0.5,
  current: false,
  attempts: [],
  ...over,
});
const chart = (over: Partial<Chart> = {}): Chart => ({
  regions: [],
  corridors: [],
  leads: [],
  ...over,
});

/** The playtest's chart: one region, the first encounter, with what Black Box holds of it. */
const first = chart({
  regions: [
    region('gravity-range', {
      name: 'GRAVITY RANGE',
      position: [4000, -250, 1200],
      radius: 1800,
      surveyed: 0.4,
      current: true,
      attempts: [
        { index: 1, outcome: 'lost' },
        { index: 2, outcome: 'recalled' },
        { index: 3, outcome: 'in-progress' },
      ],
    }),
  ],
  reach: 2700,
});

/** Four regions at different heights, as the prototype's mock had. */
const four = chart({
  regions: [
    region('a', { position: [-520, -100, 200], radius: 140, current: true }),
    region('b', { position: [0, 180, 40], radius: 130 }),
    region('c', { position: [340, -220, -340], radius: 160 }),
    region('d', { position: [680, 320, -460], radius: 120 }),
  ],
  corridors: [
    { from: 'a', to: 'b' },
    { from: 'b', to: 'c' },
    { from: 'c', to: 'nowhere' },
  ],
  leads: [
    { id: 'l1', name: 'CORRELATED TRACES', from: 'b', direction: [7.8, -4.2, 4.6], spread: 0.14 },
    { id: 'l2', name: 'NO BEARING', from: 'b', direction: [0, 0, 0], spread: 0.1 },
    { id: 'l3', name: 'FROM NOWHERE', from: 'nowhere', direction: [1, 0, 0], spread: 0.1 },
  ],
  reach: 400,
});

const dist = (a: Vec3, b: Vec3 = [0, 0, 0]): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('layoutChart', () => {
  it('puts a single region at the centre at a readable size, clear of the datum plane', () => {
    const l = layoutChart(first, R);
    expect(l.regions).toHaveLength(1);
    const r = l.regions[0]!;
    expect(dist(r.centre)).toBeCloseTo(0);
    expect(r.radius).toBeCloseTo(G.bubbleMax * R);
    expect(l.scale).toBeCloseTo((G.bubbleMax * R) / 1800);
    expect(r.centre[1] - r.radius).toBeGreaterThan(G.datum * R);
    expect(r.current).toBe(true);
    expect(r.surveyed).toBe(0.4);
  });

  it('fits every region inside the volume and above the datum plane', () => {
    const l = layoutChart(four, R);
    expect(l.regions.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
    for (const r of l.regions) {
      expect(dist(r.centre) + r.radius).toBeLessThan(R);
      expect(r.centre[1] - r.radius).toBeGreaterThan(G.datum * R);
      expect(r.radius).toBeGreaterThanOrEqual(G.bubbleMin * R - 1e-9);
      expect(r.radius).toBeLessThanOrEqual(G.bubbleMax * R + 1e-9);
    }
  });

  it('keeps proportions and heights: one scale, one shift', () => {
    const l = layoutChart(four, R);
    const [a, b, c, d] = l.regions.map((r) => r.centre) as [Vec3, Vec3, Vec3, Vec3];
    const src = four.regions.map((r) => r.position);
    expect(dist(a, b) / dist(c, d)).toBeCloseTo(dist(src[0]!, src[1]!) / dist(src[2]!, src[3]!));
    expect(dist(a, b)).toBeCloseTo(dist(src[0]!, src[1]!) * l.scale);
    // d is the highest, c the lowest, as charted.
    expect(d[1]).toBeGreaterThan(b[1]);
    expect(b[1]).toBeGreaterThan(a[1]);
    expect(a[1]).toBeGreaterThan(c[1]);
  });

  it('does not depend on where the chart puts its origin', () => {
    const moved = chart({
      ...four,
      regions: four.regions.map((r) => ({
        ...r,
        position: [r.position[0] + 9e4, r.position[1] - 3e4, r.position[2] + 5e3] as const,
      })),
    });
    const a = layoutChart(four, R);
    const b = layoutChart(moved, R);
    a.regions.forEach((r, i) => expect(dist(r.centre, b.regions[i]!.centre)).toBeCloseTo(0, 6));
  });

  it('still marks a region too small to see at the chart scale', () => {
    const l = layoutChart(
      chart({ regions: [region('near'), region('far', { position: [5000, 0, 0] })] }),
      R,
    );
    for (const r of l.regions) expect(r.radius).toBeCloseTo(G.bubbleMin * R);
    expect(dist(l.regions[0]!.centre, l.regions[1]!.centre)).toBeCloseTo(5000 * l.scale);
  });

  it('draws a chart with nothing on it, and a region with no size', () => {
    expect(layoutChart(chart(), R)).toEqual({
      scale: 1,
      regions: [],
      corridors: [],
      leads: [],
      reach: null,
    });
    const l = layoutChart(chart({ regions: [region('dot', { radius: 0, surveyed: 7 })] }), R);
    expect(l.regions[0]!.radius).toBeCloseTo(G.bubbleMin * R);
    expect(l.regions[0]!.surveyed).toBe(1);
  });

  it('ignores a repeated id, a position that is not a number, and a second current region', () => {
    const l = layoutChart(
      chart({
        regions: [
          region('a', { current: true }),
          region('a', { position: [50, 0, 0] }),
          region('lost', { position: [Number.NaN, 0, 0] }),
          region('b', { position: [10, 0, 0], current: true }),
        ],
      }),
      R,
    );
    expect(l.regions.map((r) => [r.id, r.current])).toEqual([
      ['a', true],
      ['b', false],
    ]);
  });

  it('draws corridors between charted regions only', () => {
    const l = layoutChart(four, R);
    expect(l.corridors).toHaveLength(2);
    expect(l.corridors[0]).toEqual([l.regions[0]!.centre, l.regions[1]!.centre]);
  });

  it('draws a lead as a bearing from its region: a direction, kept inside the volume', () => {
    const l = layoutChart(four, R);
    expect(l.leads.map((x) => x.id)).toEqual(['l1']);
    const lead = l.leads[0]!;
    expect(lead.origin).toEqual(l.regions[1]!.centre);
    expect(dist(lead.direction)).toBeCloseTo(1);
    const n = Math.hypot(7.8, -4.2, 4.6);
    expect(lead.direction[1]).toBeCloseTo(-4.2 / n);
    expect(lead.length).toBeGreaterThan(0);
    expect(lead.length).toBeLessThanOrEqual(G.leadLength * R);
    expect(dist(lead.end)).toBeLessThan(R);
    expect(dist(lead.end, lead.origin)).toBeCloseTo(lead.length);
    expect(lead.spread).toBe(0.14);
  });

  it('stops a bearing short of the edge of the volume', () => {
    const l = layoutChart(
      chart({
        regions: [region('a', { position: [-100, 0, 0] }), region('b', { position: [100, 0, 0] })],
        leads: [{ id: 'out', name: 'OUT', from: 'b', direction: [1, 0, 0], spread: 9 }],
      }),
      R,
    );
    const lead = l.leads[0]!;
    expect(lead.length).toBeLessThan(G.leadLength * R);
    expect(lead.end[0]).toBeCloseTo(G.leadEdge * R);
    expect(lead.spread).toBe(G.leadSpreadMax);
  });

  it('draws reach to scale from the region the ship is in', () => {
    const l = layoutChart(four, R);
    expect(l.reach).toEqual({
      centre: l.regions[0]!.centre,
      radius: 400 * l.scale,
      clipped: false,
    });
    expect(layoutChart(chart({ ...four, reach: undefined }), R).reach).toBeNull();
    const nobodyHome = four.regions.map((r) => ({ ...r, current: false }));
    expect(layoutChart(chart({ ...four, regions: nobodyHome }), R).reach).toBeNull();
  });

  it('says so when reach is more than the volume can show', () => {
    const reach = layoutChart(chart({ ...four, reach: 1e6 }), R).reach!;
    expect(reach.clipped).toBe(true);
    expect(dist(reach.centre) + reach.radius).toBeCloseTo(R);
  });
});

describe('attempt marks', () => {
  it('marks ended attempts with how they ended; the one under way is the ship, not a mark', () => {
    const m = selectMarks(first.regions[0]!.attempts, true);
    expect(m.marks.map((x) => x.text)).toEqual(['✕ 1', '↺ 2']);
    expect(m.earlier).toBe(0);
    expect(m.underway).toBe(3);
    expect(markTexts(m)).toEqual(['✕ 1', '↺ 2']);
  });

  it('shows the attempt under way only where the ship is', () => {
    const m = selectMarks([{ index: 4, outcome: 'in-progress' }], false);
    expect(m).toEqual({ marks: [], earlier: 0, underway: null });
  });

  it('marks a completed attempt too', () => {
    expect(selectMarks([{ index: 6, outcome: 'completed' }], false).marks[0]).toEqual({
      index: 6,
      outcome: 'completed',
      text: '✓ 6',
    });
  });

  it('keeps the latest marks and counts the older ones', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ index: i + 1, outcome: 'lost' as const }));
    const m = selectMarks(many, false);
    expect(m.marks).toHaveLength(MARK_LIMIT);
    expect(m.marks[0]!.index).toBe(13);
    expect(m.marks.at(-1)!.index).toBe(20);
    expect(m.earlier).toBe(12);
    expect(markTexts(m)[0]).toBe('+12');
    expect(markTexts(m)).toHaveLength(MARK_LIMIT + 1);
  });

  it('spaces marks around the region without two sharing a bearing', () => {
    for (const n of [1, 3, MARK_LIMIT + 1]) {
      const angles = Array.from({ length: n }, (_, i) => markAngle(i, n));
      const turn = angles.map((a) => a - angles[0]!);
      expect(turn.at(-1)!).toBeLessThan(Math.PI * 2);
      for (let i = 1; i < n; i++) expect(turn[i]! - turn[i - 1]!).toBeGreaterThan(0.5);
    }
    // A mark keeps its place when a later attempt is added beside it.
    expect(markAngle(1, 3)).toBe(markAngle(1, 2));
  });
});

describe('haze of unsurveyed space', () => {
  const scatter = hazeScatter(R);

  it('fills the volume above the datum plane, the same every time', () => {
    expect(scatter).toHaveLength(2400 * 3);
    expect(hazeScatter(R)).toEqual(scatter);
    for (let i = 0; i < scatter.length; i += 3) {
      expect(Math.hypot(scatter[i]!, scatter[i + 1]!, scatter[i + 2]!)).toBeLessThanOrEqual(R);
      expect(scatter[i + 1]!).toBeGreaterThanOrEqual(G.datum * R);
    }
  });

  it('is left out of charted space: bubbles and corridors', () => {
    const l = layoutChart(four, R);
    const haze = hazeOutside(scatter, l, R);
    expect(haze.length).toBeLessThan(scatter.length);
    expect(haze.length).toBeGreaterThan(scatter.length / 2);
    const [a, b] = l.corridors[0]!;
    const mid: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    for (let i = 0; i < haze.length; i += 3) {
      const p: Vec3 = [haze[i]!, haze[i + 1]!, haze[i + 2]!];
      for (const r of l.regions) expect(dist(p, r.centre)).toBeGreaterThanOrEqual(r.radius);
      expect(dist(p, mid)).toBeGreaterThanOrEqual(G.hazeCorridor * R);
    }
  });

  it('is everywhere when nothing is charted', () => {
    expect(hazeOutside(scatter, layoutChart(chart(), R), R)).toEqual(scatter);
  });
});

describe('leadConeWire', () => {
  it('draws spokes from the origin and rings at the half-angle of the bearing', () => {
    for (const direction of [
      [7.8, -4.2, 4.6],
      [0, 1, 0],
      [0, -1, 0.001],
    ] as const) {
      const l = layoutChart(
        chart({
          regions: [region('a')],
          leads: [{ id: 'l', name: 'L', from: 'a', direction, spread: 0.2 }],
        }),
        R,
      );
      const lead = l.leads[0]!;
      const flat = leadConeWire(lead);
      expect(flat).toHaveLength((6 + 3 * 24) * 6);
      expect(flat.every((v) => Number.isFinite(v))).toBe(true);
      // Each spoke starts at the origin and ends on the far rim, 0.2 rad off the bearing.
      for (let i = 0; i < 6; i++) {
        const o: Vec3 = [flat[i * 6]!, flat[i * 6 + 1]!, flat[i * 6 + 2]!];
        const p: Vec3 = [flat[i * 6 + 3]!, flat[i * 6 + 4]!, flat[i * 6 + 5]!];
        expect(dist(o, lead.origin)).toBeCloseTo(0);
        const along =
          (p[0] - o[0]) * lead.direction[0] +
          (p[1] - o[1]) * lead.direction[1] +
          (p[2] - o[2]) * lead.direction[2];
        expect(along).toBeCloseTo(lead.length);
        expect(Math.acos(along / dist(p, o))).toBeCloseTo(0.2);
      }
    }
  });
});

describe('picking', () => {
  const l = layoutChart(four, R);
  const targets = pickTargets(l, R);
  const toward = (from: Vec3, to: Vec3): Ray =>
    new Ray(new Vector3(...from), new Vector3(...to).sub(new Vector3(...from)).normalize());

  it('finds regions by their bubbles and leads by the end of their bearing', () => {
    expect(targets.map((t) => `${t.kind}:${t.id}`)).toEqual([
      'region:a',
      'region:b',
      'region:c',
      'region:d',
      'lead:l1',
    ]);
    expect(pickTarget(toward([0, 5, 0], l.regions[2]!.centre), targets)).toEqual({
      kind: 'region',
      id: 'c',
    });
    expect(pickTarget(toward([0, 5, 0], l.leads[0]!.end), targets)).toEqual({
      kind: 'lead',
      id: 'l1',
    });
  });

  it('takes the nearest along the ray, and nothing when the ray misses', () => {
    const a = l.regions[0]!.centre;
    const b = l.regions[1]!.centre;
    const beyond: Vec3 = [b[0] * 3 - a[0] * 2, b[1] * 3 - a[1] * 2, b[2] * 3 - a[2] * 2];
    expect(pickTarget(toward(beyond, a), targets)).toEqual({ kind: 'region', id: 'b' });
    expect(pickTarget(new Ray(new Vector3(0, 5, 0), new Vector3(0, 1, 0)), targets)).toBeNull();
    expect(pickTarget(toward([0, 5, 0], [0, 0, 0]), [])).toBeNull();
  });
});

// ---- The hologram itself, without a renderer ----------------------------------------------------

/** Just enough of an element for a CSS2D tag: text, a class list, a style. */
class FakeElement {
  className = '';
  textContent = '';
  readonly style: Record<string, string> = {};
  readonly parentNode = null;
  readonly ownerDocument = { defaultView: { Element: FakeElement } };
  readonly classes = new Set<string>();
  readonly classList = {
    toggle: (name: string, on: boolean): void => {
      if (on) this.classes.add(name);
      else this.classes.delete(name);
    },
  };
  setAttribute(): void {}
}

const tagsOf = (root: Object3D): FakeElement[] => {
  const out: FakeElement[] = [];
  root.traverse((o) => {
    const el = (o as { element?: unknown }).element;
    if (el instanceof FakeElement) out.push(el);
  });
  return out;
};
const down = (x = 0, z = 0): Raycaster =>
  new Raycaster(new Vector3(x, 5, z), new Vector3(0, -1, 0));

describe('makeMapHolo', () => {
  afterEach(() => vi.unstubAllGlobals());
  const make = () => {
    vi.stubGlobal('document', { createElement: () => new FakeElement() });
    return makeMapHolo();
  };

  it('draws the volume and haze before it has a chart', () => {
    const map = makeMapHolo();
    expect(map.spin.parent).toBe(map.group);
    expect(map.selected()).toBeNull();
    expect(map.pick(down())).toBeNull();
    map.update(0.016, 1);
    map.dispose();
  });

  it('reads well with one region: its name, its attempts, the ship, its reach', () => {
    const map = make();
    map.setChart(first);
    const tags = tagsOf(map.group);
    expect(tags.map((t) => [t.textContent, t.className])).toEqual([
      ['GRAVITY RANGE', 'rx-tag'],
      ['✕ 1', 'rx-tag bbx'],
      ['↺ 2', 'rx-tag bbx'],
      ['ATTEMPT 3', 'rx-tag sel'],
      ['REACH', 'rx-tag dim'],
    ]);
    expect(map.pick(down())).toEqual({ kind: 'region', id: 'gravity-range' });
    expect(map.pick(down(0.9, 0.3))).toBeNull();
    map.setResolution(1600, 900);
    map.setPixelsPerUnit(340);
    map.update(0.016, 3.1);
    map.dispose();
  });

  it('picks through whatever the host has done to the group and the spin', () => {
    const map = make();
    map.setChart(first);
    map.group.position.set(2, 1, -3);
    map.group.rotation.x = 0.24;
    map.spin.rotation.y = 1.1;
    map.spin.scale.setScalar(2);
    expect(map.pick(down(2, -3))).toEqual({ kind: 'region', id: 'gravity-range' });
    // Twice the size: a ray that would miss the bubble at rest now finds it.
    const off = G.bubbleMax * R * 1.5;
    expect(map.pick(down(2 + off, -3))).toEqual({ kind: 'region', id: 'gravity-range' });
    map.group.visible = false;
    expect(map.pick(down(2, -3))).toBeNull();
    map.dispose();
  });

  it('tells listeners when the selection changes, and only then', () => {
    const map = make();
    map.setChart(four);
    const heard = vi.fn();
    const stop = map.onChange(heard);
    map.select({ kind: 'region', id: 'b' });
    expect(map.selected()).toEqual({ kind: 'region', id: 'b' });
    expect(heard).toHaveBeenCalledTimes(1);
    const held = map.selected();
    map.select({ kind: 'region', id: 'b' });
    expect(map.selected()).toBe(held);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(
      tagsOf(map.group)
        .filter((t) => t.classes.has('sel'))
        .map((t) => t.textContent),
    ).toEqual(['B']);
    map.hover({ kind: 'lead', id: 'l1' });
    expect(heard).toHaveBeenCalledTimes(1);
    map.select({ kind: 'lead', id: 'l1' });
    expect(
      tagsOf(map.group)
        .filter((t) => t.classes.has('sel'))
        .map((t) => t.textContent),
    ).toEqual(['CORRELATED TRACES']);
    map.select({ kind: 'region', id: 'not-charted' });
    expect(map.selected()).toBeNull();
    expect(heard).toHaveBeenCalledTimes(3);
    stop();
    map.select({ kind: 'region', id: 'a' });
    expect(heard).toHaveBeenCalledTimes(3);
    map.dispose();
  });

  it('rebuilds only when the chart changed, and lets go of a selection that left the chart', () => {
    const map = make();
    map.setChart(four);
    const before = tagsOf(map.group);
    map.setChart(structuredClone(four) as Chart);
    expect(tagsOf(map.group).every((t, i) => t === before[i])).toBe(true);

    const heard = vi.fn();
    map.onChange(heard);
    map.select({ kind: 'region', id: 'd' });
    map.setChart(chart({ ...four, regions: four.regions.slice(0, 3) }));
    expect(tagsOf(map.group).some((t, i) => t !== before[i])).toBe(true);
    expect(map.selected()).toBeNull();
    expect(heard).toHaveBeenCalledTimes(2);

    map.select({ kind: 'region', id: 'a' });
    map.setChart(chart({ ...four, regions: four.regions.slice(0, 2), reach: 300 }));
    expect(map.selected()).toEqual({ kind: 'region', id: 'a' });
    expect(heard).toHaveBeenCalledTimes(3);
    map.dispose();
    expect(tagsOf(map.group)).toHaveLength(0);
  });
});
