/**
 * The MAP hologram's chart, and where each thing on it goes inside the projection volume.
 * No scene objects here: plain numbers, so it runs (and is tested) without a renderer.
 *
 * Belief side (P11). A chart holds only what the ship has charted: regions it has surveyed,
 * corridors it has flown, bearings it has taken, what Black Box recorded. The exit is never on
 * it, and everything the chart does not mention is drawn as unsurveyed haze.
 */
import { Sphere, Vector3 } from 'three';
import type { Ray } from 'three';
import { clamp, dressingRandom } from '../gfx.ts';

export type ChartOutcome = 'in-progress' | 'lost' | 'recalled' | 'completed';

export interface ChartAttempt {
  readonly index: number;
  readonly outcome: ChartOutcome;
}

export interface ChartRegion {
  readonly id: string;
  /** Short instrument label, e.g. "GRAVITY RANGE". */
  readonly name: string;
  /** Position in chart units (any consistent unit; the hologram normalises all regions to fit its volume). y is up. */
  readonly position: readonly [number, number, number];
  /** Radius of the bubble of surveyed space, chart units. */
  readonly radius: number;
  /** 0..1: how much of the region has been surveyed (drawn as an arc of the bubble's equator). */
  readonly surveyed: number;
  /** The ship is here now. */
  readonly current: boolean;
  /** Attempts recorded here by Black Box, oldest first. */
  readonly attempts: readonly ChartAttempt[];
}

/** A corridor flown between two regions (region ids). */
export interface ChartCorridor {
  readonly from: string;
  readonly to: string;
}

export interface ChartLead {
  readonly id: string;
  readonly name: string;
  /** Region id the bearing was taken from. */
  readonly from: string;
  readonly direction: readonly [number, number, number];
  /** Half-angle of the bearing cone, radians. */
  readonly spread: number;
}

export interface Chart {
  readonly regions: readonly ChartRegion[];
  readonly corridors: readonly ChartCorridor[];
  readonly leads: readonly ChartLead[];
  /** Radius the propellant on board can reach from the current region, chart units; absent = not drawn. */
  readonly reach?: number;
}

export type MapPick = { readonly kind: 'region' | 'lead'; readonly id: string };

/** A point or direction in the hologram's own frame: metres from the centre of the volume, y up. */
export type Vec3 = readonly [number, number, number];

const TAU = Math.PI * 2;

/**
 * Proportions of the hologram, as fractions of the volume's radius (the prototype's metres at its
 * radius of 1.1). Where things go and how big they are; how a mark looks is in the theme.
 */
export const MAP_GEOMETRY = {
  /** Height of the datum plane, below the centre of the volume. */
  datum: -0.455,
  /** Every region, bubble included, is fitted within this distance of the centre... */
  fit: 0.62,
  /** ...and within this height above and below it, so each bubble clears the datum plane. */
  fitHeight: 0.3,
  /** Smallest and largest drawn bubble: a far-off region is still a mark, a lone one is not the whole chart. */
  bubbleMin: 0.08,
  bubbleMax: 0.2,
  /** Drawn length of a bearing cone (its range is not known), and how near the volume's edge it may come. */
  leadLength: 0.55,
  leadEdge: 0.97,
  /** Widest half-angle a bearing cone is drawn with, radians. */
  leadSpreadMax: 1,
  /** Radius of the sphere at a cone's far end that the cursor can find. */
  leadPick: 0.064,
  /** Selection ring around a region, as a multiple of its bubble. */
  selectionScale: 1.2,
  /** Space kept clear of haze around a bubble and along a corridor. */
  hazeMargin: 0.07,
  hazeCorridor: 0.09,
} as const;

// ---- Earlier attempts ---------------------------------------------------------------------------

export type EndedOutcome = Exclude<ChartOutcome, 'in-progress'>;

/** Black Box's mark for how an attempt ended: lost, recalled, completed. */
const GLYPH: Readonly<Record<EndedOutcome, string>> = { lost: '✕', recalled: '↺', completed: '✓' };

/** Most attempts marked one by one around a region; older ones are drawn as a single count. */
export const MARK_LIMIT = 8;

export interface AttemptMark {
  readonly index: number;
  readonly outcome: EndedOutcome;
  /** What its tag reads, e.g. "✕ 3". */
  readonly text: string;
}

export interface RegionMarks {
  /** Ended attempts marked one by one, oldest first: the latest `limit` of them. */
  readonly marks: readonly AttemptMark[];
  /** How many older ended attempts there are besides. */
  readonly earlier: number;
  /** Index of the attempt under way, when the ship is in this region. */
  readonly underway: number | null;
}

/**
 * Which of a region's attempts get a mark. An attempt still in progress is not Black Box's to
 * mark: it shows as the ship itself, and only in the region the ship is in.
 */
export function selectMarks(
  attempts: readonly ChartAttempt[],
  current: boolean,
  limit = MARK_LIMIT,
): RegionMarks {
  const ended: AttemptMark[] = [];
  let underway: number | null = null;
  for (const a of attempts) {
    if (a.outcome === 'in-progress') {
      if (current) underway = a.index;
      continue;
    }
    ended.push({ index: a.index, outcome: a.outcome, text: `${GLYPH[a.outcome]} ${a.index}` });
  }
  const earlier = Math.max(0, ended.length - Math.max(0, Math.floor(limit)));
  return { marks: ended.slice(earlier), earlier, underway };
}

/** The tags around a region, in order: a count of the older attempts, then each mark, oldest first. */
export function markTexts(marks: RegionMarks): string[] {
  const out = marks.earlier > 0 ? [`+${marks.earlier}`] : [];
  for (const m of marks.marks) out.push(m.text);
  return out;
}

/**
 * Bearing of the i-th of n marks around a region, in `arcXZ`'s convention (0 is away from the
 * viewer, positive toward +x). Marks start on the right and run clockwise seen from above.
 */
export function markAngle(i: number, n: number): number {
  return Math.PI / 2 + (i * TAU) / Math.max(n, MARK_LIMIT);
}

// ---- Layout -------------------------------------------------------------------------------------

export interface PlacedRegion {
  readonly id: string;
  readonly name: string;
  readonly centre: Vec3;
  /** Drawn radius of the bubble, metres. */
  readonly radius: number;
  /** 0..1. */
  readonly surveyed: number;
  /** The ship is here (true for one region at most). */
  readonly current: boolean;
  readonly marks: RegionMarks;
}

export interface PlacedLead {
  readonly id: string;
  readonly name: string;
  /** Centre of the region the bearing was taken from. */
  readonly origin: Vec3;
  /** Unit vector. */
  readonly direction: Vec3;
  /** Drawn length, metres. The range is unresolved; this is only how far the cone is drawn. */
  readonly length: number;
  /** Half-angle, radians. */
  readonly spread: number;
  /** Far end of the bearing: `origin + direction * length`. */
  readonly end: Vec3;
}

export interface PlacedReach {
  readonly centre: Vec3;
  readonly radius: number;
  /** The reach is larger than the volume can show; the sphere is drawn at the volume's edge. */
  readonly clipped: boolean;
}

export interface ChartLayout {
  /** Hologram metres per chart unit. */
  readonly scale: number;
  readonly regions: readonly PlacedRegion[];
  /** Each corridor as its two ends. */
  readonly corridors: readonly (readonly [Vec3, Vec3])[];
  readonly leads: readonly PlacedLead[];
  readonly reach: PlacedReach | null;
}

const finite3 = (v: Vec3): boolean => v.every((n) => Number.isFinite(n));
const size = (r: ChartRegion): number => (Number.isFinite(r.radius) && r.radius > 0 ? r.radius : 0);

/** Distance from `o` along the unit vector `d` to a sphere of radius `r` about the centre (0 from outside it). */
function toEdge(o: Vec3, d: Vec3, r: number): number {
  const b = o[0] * d[0] + o[1] * d[1] + o[2] * d[2];
  const c = o[0] * o[0] + o[1] * o[1] + o[2] * o[2] - r * r;
  return c >= 0 ? 0 : -b + Math.sqrt(b * b - c);
}

/**
 * Chart units to hologram metres. One uniform scale and one shift, so bearings and proportions
 * between regions are kept: the middle of everything charted goes to the centre of the volume, and
 * the scale is the largest at which every bubble fits, clears the datum plane, and no bubble is
 * larger than `bubbleMax` (so a single region sits at the centre at a readable size). Regions too
 * small to see at that scale are drawn at `bubbleMin`.
 *
 * Anything that refers to a region not on the chart is left out, as is a second region or lead
 * with an id already used and a lead with no direction.
 */
export function layoutChart(chart: Chart, radius: number): ChartLayout {
  const g = MAP_GEOMETRY;
  const ids = new Set<string>();
  const regions = chart.regions.filter((r) => {
    if (ids.has(r.id) || !finite3(r.position)) return false;
    ids.add(r.id);
    return true;
  });

  const middle = (axis: 0 | 1 | 2): number => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const r of regions) {
      lo = Math.min(lo, r.position[axis] - size(r));
      hi = Math.max(hi, r.position[axis] + size(r));
    }
    return regions.length > 0 ? (lo + hi) / 2 : 0;
  };
  const cx = middle(0);
  const cy = middle(1);
  const cz = middle(2);

  let extent = 0;
  let rise = 0;
  let widest = 0;
  for (const r of regions) {
    const [x, y, z] = r.position;
    extent = Math.max(extent, Math.hypot(x - cx, y - cy, z - cz) + size(r));
    rise = Math.max(rise, Math.abs(y - cy) + size(r));
    widest = Math.max(widest, size(r));
  }
  const limits: number[] = [];
  if (extent > 0) limits.push((g.fit * radius) / extent);
  if (rise > 0) limits.push((g.fitHeight * radius) / rise);
  if (widest > 0) limits.push((g.bubbleMax * radius) / widest);
  const scale = limits.length > 0 ? Math.min(...limits) : 1;

  const here = regions.find((r) => r.current);
  const placed: PlacedRegion[] = regions.map((r) => {
    const [x, y, z] = r.position;
    const current = r === here;
    return {
      id: r.id,
      name: r.name,
      centre: [(x - cx) * scale, (y - cy) * scale, (z - cz) * scale],
      radius: clamp(size(r) * scale, g.bubbleMin * radius, g.bubbleMax * radius),
      surveyed: Number.isFinite(r.surveyed) ? clamp(r.surveyed, 0, 1) : 0,
      current,
      marks: selectMarks(r.attempts, current),
    };
  });
  const at = new Map(placed.map((r) => [r.id, r]));

  const corridors: (readonly [Vec3, Vec3])[] = [];
  for (const c of chart.corridors) {
    const a = at.get(c.from);
    const b = at.get(c.to);
    if (a && b && a !== b) corridors.push([a.centre, b.centre]);
  }

  const leadIds = new Set<string>();
  const leads: PlacedLead[] = [];
  for (const l of chart.leads) {
    const from = at.get(l.from);
    const [dx, dy, dz] = l.direction;
    const norm = Math.hypot(dx, dy, dz);
    if (!from || leadIds.has(l.id) || !Number.isFinite(norm) || norm <= 0) continue;
    leadIds.add(l.id);
    const direction: Vec3 = [dx / norm, dy / norm, dz / norm];
    const origin = from.centre;
    const length = Math.min(g.leadLength * radius, toEdge(origin, direction, g.leadEdge * radius));
    leads.push({
      id: l.id,
      name: l.name,
      origin,
      direction,
      length,
      spread: Number.isFinite(l.spread) ? clamp(l.spread, 0, g.leadSpreadMax) : 0,
      end: [
        origin[0] + direction[0] * length,
        origin[1] + direction[1] * length,
        origin[2] + direction[2] * length,
      ],
    });
  }

  let reach: PlacedReach | null = null;
  const ship = placed.find((r) => r.current);
  if (ship && chart.reach !== undefined && Number.isFinite(chart.reach) && chart.reach > 0) {
    const room = radius - Math.hypot(...ship.centre);
    const wanted = chart.reach * scale;
    reach = { centre: ship.centre, radius: Math.min(wanted, room), clipped: wanted > room };
  }

  return { scale, regions: placed, corridors, leads, reach };
}

// ---- Geometry made from a layout ----------------------------------------------------------------

/**
 * Wire of a bearing cone as line segments: spokes from the origin to the far rim, and three rings
 * across it. A lead is a direction, not a place, until a second bearing crosses it.
 */
export function leadConeWire(lead: PlacedLead, spokes = 6, around = 24): number[] {
  const [ox, oy, oz] = lead.origin;
  const [dx, dy, dz] = lead.direction;
  // Two unit vectors square to the bearing and to each other.
  let ux = -dz;
  let uy = 0;
  let uz = dx;
  if (Math.abs(dy) > 0.99) {
    ux = 0;
    uy = -dz;
    uz = dy;
  }
  const un = Math.hypot(ux, uy, uz);
  ux /= un;
  uy /= un;
  uz /= un;
  const vx = dy * uz - dz * uy;
  const vy = dz * ux - dx * uz;
  const vz = dx * uy - dy * ux;
  const flare = Math.tan(lead.spread) * lead.length;
  const rim = (f: number, a: number): Vec3 => {
    const c = Math.cos(a) * flare * f;
    const s = Math.sin(a) * flare * f;
    const along = lead.length * f;
    return [
      ox + dx * along + ux * c + vx * s,
      oy + dy * along + uy * c + vy * s,
      oz + dz * along + uz * c + vz * s,
    ];
  };
  const out: number[] = [];
  for (let i = 0; i < spokes; i++) out.push(ox, oy, oz, ...rim(1, (TAU * i) / spokes));
  for (const f of [0.34, 0.67, 1])
    for (let i = 0; i < around; i++)
      out.push(...rim(f, (TAU * i) / around), ...rim(f, (TAU * (i + 1)) / around));
  return out;
}

/**
 * A fixed scatter of points through the volume above the datum plane, as a flat list: the stock
 * the haze of unsurveyed space is cut from. Set dressing; the same every time.
 */
export function hazeScatter(radius: number, count = 2400): number[] {
  const rnd = dressingRandom(5);
  const floor = MAP_GEOMETRY.datum * radius;
  const out: number[] = [];
  // A little over half the throws land outside the volume; the cap only guards a bad radius.
  for (let tries = 0; out.length < count * 3 && tries < count * 40; tries++) {
    const x = (rnd() * 2 - 1) * radius;
    const y = (rnd() * 2 - 1) * radius;
    const z = (rnd() * 2 - 1) * radius;
    if (Math.hypot(x, y, z) > radius || y < floor) continue;
    out.push(x, y, z);
  }
  return out;
}

function distanceToSegment(p: Vec3, a: Vec3, b: Vec3): number {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const abz = b[2] - a[2];
  const len2 = abx * abx + aby * aby + abz * abz;
  const along = (p[0] - a[0]) * abx + (p[1] - a[1]) * aby + (p[2] - a[2]) * abz;
  const t = len2 > 0 ? clamp(along / len2, 0, 1) : 0;
  return Math.hypot(p[0] - a[0] - abx * t, p[1] - a[1] - aby * t, p[2] - a[2] - abz * t);
}

/** The scatter with charted space taken out: haze is only where the ship has not been. */
export function hazeOutside(
  scatter: readonly number[],
  layout: ChartLayout,
  radius: number,
): number[] {
  const margin = MAP_GEOMETRY.hazeMargin * radius;
  const lane = MAP_GEOMETRY.hazeCorridor * radius;
  const out: number[] = [];
  for (let i = 0; i + 2 < scatter.length; i += 3) {
    const p: Vec3 = [scatter[i]!, scatter[i + 1]!, scatter[i + 2]!];
    const charted =
      layout.regions.some(
        (r) =>
          Math.hypot(p[0] - r.centre[0], p[1] - r.centre[1], p[2] - r.centre[2]) <
          r.radius + margin,
      ) || layout.corridors.some(([a, b]) => distanceToSegment(p, a, b) < lane);
    if (!charted) out.push(p[0], p[1], p[2]);
  }
  return out;
}

// ---- Picking ------------------------------------------------------------------------------------

/** Something the cursor can find: a sphere in the hologram's frame. */
export interface PickTarget extends MapPick {
  readonly centre: Vec3;
  readonly radius: number;
  /** Radius of the selection ring drawn around it. */
  readonly ring: number;
}

export const pickKey = (p: MapPick): string => `${p.kind}:${p.id}`;

/** A region is found by its bubble; a lead by the far end of its bearing. */
export function pickTargets(layout: ChartLayout, radius: number): PickTarget[] {
  const g = MAP_GEOMETRY;
  const out: PickTarget[] = [];
  for (const r of layout.regions)
    out.push({
      kind: 'region',
      id: r.id,
      centre: r.centre,
      radius: r.radius,
      ring: r.radius * g.selectionScale,
    });
  for (const l of layout.leads)
    out.push({
      kind: 'lead',
      id: l.id,
      centre: l.end,
      radius: g.leadPick * radius,
      ring: g.leadPick * radius,
    });
  return out;
}

const SPHERE = new Sphere();
const HIT = new Vector3();

/** The nearest target along a ray given in the hologram's own frame, or null. */
export function pickTarget(ray: Ray, targets: readonly PickTarget[]): MapPick | null {
  let best: PickTarget | null = null;
  let nearest = Infinity;
  for (const t of targets) {
    SPHERE.center.set(t.centre[0], t.centre[1], t.centre[2]);
    SPHERE.radius = t.radius;
    if (!ray.intersectSphere(SPHERE, HIT)) continue;
    const d = HIT.distanceToSquared(ray.origin);
    if (d < nearest) {
      nearest = d;
      best = t;
    }
  }
  return best ? { kind: best.kind, id: best.id } : null;
}
