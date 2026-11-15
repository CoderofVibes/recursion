/**
 * The lattice rebuilt from recorded angular frames (DECISIONS A16, P11, P13; S17
 * `docs/studies/s17/black-box.md` § "A short reconstruction, from data only"; 3C's handoff R9).
 *
 * Recorded inputs only: each frame's anonymous fragments, its measured camera basis and the
 * ship's believed pose at the frame's acquisition (not at product delivery), with covariance.
 *
 * 1. Nodes. In each frame, fragment endpoints that coincide in the image are one node, and each
 *    fragment is an observed edge between two nodes.
 * 2. Association. Nodes are linked frame to frame by their inertial rays, only when the match is
 *    mutual and unambiguous (ratio test). An ambiguous node starts a new track: competing
 *    associations stay unresolved, they are never settled from a truth mesh.
 * 3. Fit. Each track is triangulated (a linear ray fit, then Gauss–Newton on its slope
 *    residuals) on its earlier observations, and all of them are then fitted together with the
 *    pass's pose error, an offset and a drift held by the believed poses' covariance (bundle
 *    adjustment). The later observations test each point (held-out support). A point's
 *    covariance is the inverse normal matrix (slope noise, the frame-common rotation of the
 *    measured basis, the attitude) plus the pose error's share; the common offset the data
 *    cannot see stays at its prior and does not average away (S17). With no drift prior this is
 *    exactly S17's fit.
 * 4. Strands are chains of supported nodes along edges observed in at least two frames: only
 *    connected support actually observed, never a completed grid.
 * 5. Coverage. Angular detections cannot certify an empty opening, so everything observed is
 *    `unresolved`; nothing is ever `clear-supported` without an independently calibrated
 *    detection model, which does not exist yet. Unobserved space carries no patch at all (the
 *    renderer's default is unknown).
 *
 * The result is a function of the records and the poses; it is never stored as truth and is
 * rebuilt in canonical acquisition order. `LATTICE_RECONSTRUCTION_VERSION` and the settings'
 * hash identify the algorithm that made it.
 */

import type { Cov3, Vec3 } from '../../contracts/index.ts';
import { hashState } from '../../lib/hash.ts';
import * as quat from '../../lib/quat.ts';
import type { Quat } from '../../lib/quat.ts';
import type { AngularFrame } from './frames.ts';

/** Bump when anything that changes a reconstruction's numbers changes. */
export const LATTICE_RECONSTRUCTION_VERSION = 2;

export interface LatticeSettings {
  /** Endpoints of one frame within this many σ of each other are one node. */
  readonly nodeMergeSigmas: number;
  /** Largest angle between two rays that may be one node seen twice, rad (its parallax). */
  readonly associationGate: number;
  /**
   * Two sightings may be one node only within this many σ of each other's epipolar line, and
   * two depths agree within this many σ (see `associate`).
   */
  readonly associationSigmas: number;
  /** A depth in conflict with the chosen one may have at most this share of its support. */
  readonly associationRatio: number;
  /** Sightings this many seconds apart or less are compared directly, s. */
  readonly associationWindow: number;
  /** A node takes a depth only when at least this many other frames agree on it. */
  readonly associationVotes: number;
  /**
   * A pair votes on a depth only when its rays fix it to this fraction (1σ): one with less
   * parallax agrees with any depth and cannot tell the true point from a neighbour.
   */
  readonly associationDepthPrecision: number;
  /** Two depths agree within this many σ of their difference. */
  readonly associationDepthSigmas: number;
  /** Training observations a node needs. */
  readonly minTraining: number;
  /** The later share of a track's observations held out to test its fit. */
  readonly heldOutFraction: number;
  /** Held-out observations a node needs. */
  readonly minHeldOut: number;
  /** Held-out test: χ²/n ≤ 1 + k √(2/n). */
  readonly heldOutK: number;
  /** A node is resolved only if its formal 1σ (before the shared pose) is at most this, m. */
  readonly maxPointSigma: number;
  /** Frames an edge needs to count as observed. */
  readonly minEdgeFrames: number;
  /** An edge longer than this many times the field's median supported edge is not drawn. */
  readonly maxEdgeOverTypical: number;
  /** How long reconstructed geometry counts as fresh after its last observation, s. */
  readonly validity: number;
}

/**
 * [ASSUMED] Play values; S17 fixes only the held-out share (6 of 54) and the shared pose term.
 * Node merging: 3C's sensor draws a shared endpoint's noise separately in each fragment, so two
 * copies differ by σ√2 per axis; 6σ misses about one in 10⁴, while distinct piece endpoints
 * (12 m apart) stay about 19σ apart even at the 1,200 m range limit.
 */
export const LATTICE_SETTINGS: LatticeSettings = {
  nodeMergeSigmas: 6,
  associationGate: 0.05,
  associationSigmas: 4,
  associationRatio: 0.5,
  associationWindow: 30,
  associationVotes: 2,
  associationDepthPrecision: 0.15,
  associationDepthSigmas: 2,
  minTraining: 12,
  heldOutFraction: 0.1,
  minHeldOut: 3,
  heldOutK: 3,
  maxPointSigma: 3,
  minEdgeFrames: 2,
  maxEdgeOverTypical: 3,
  validity: 120,
};

export interface CameraPose {
  /** Believed inertial position of the camera at acquisition. */
  readonly origin: Vec3;
  /** Believed attitude at acquisition, body → inertial. */
  readonly attitude: Quat;
  /** One-σ per axis of that attitude, rad. */
  readonly attitudeSigma: number;
  /** Covariance of the origin, common to every ray of the pass (it does not average away). */
  readonly originCov: Cov3;
  /**
   * Covariance of the believed velocity: how far the believed path may drift during the pass.
   * Absent: no drift (the pose error is one common offset, as in S17's reference).
   */
  readonly velocityCov?: Cov3;
}

export interface PosedFrame {
  readonly frame: AngularFrame;
  /** Null: no believed pose at that time; the frame is kept as missing, never guessed. */
  readonly pose: CameraPose | null;
  /** Attempt-scoped sample identity (lineage). */
  readonly sampleId: string;
}

export interface ReconstructedNode {
  readonly id: string;
  readonly field: string;
  readonly position: Vec3;
  /** 3×3 covariance including the shared pose term, m². */
  readonly covariance: Cov3;
  /** The fit's own part (slopes, basis and attitude), m². */
  readonly formalCovariance: Cov3;
  readonly training: number;
  readonly heldOut: number;
  /** RMS of the held-out slope residuals in their σ. */
  readonly heldOutRms: number;
  readonly supported: boolean;
  /** Why a node is not supported: 'too-few', 'no-parallax', 'behind', 'held-out'. */
  readonly reason?: string;
  readonly sampleIds: readonly string[];
  readonly observedFrom: number;
  readonly observedTo: number;
}

export interface ReconstructedStrand {
  readonly id: string;
  readonly field: string;
  readonly nodes: readonly string[];
  readonly points: readonly Vec3[];
  /** Largest 1σ semi-axis over its nodes, shared pose included, m. */
  readonly sigmaM: number;
  /** In (0, 1]: how well its nodes predicted the frames held out. */
  readonly confidence: number;
  readonly sampleIds: readonly string[];
  readonly observedFrom: number;
  readonly observedTo: number;
  readonly validUntil: number;
}

export interface Volume {
  readonly center: Vec3;
  readonly halfSize: Vec3;
}

export interface CoveragePatch extends Volume {
  readonly id: string;
  readonly status: 'unresolved';
  readonly reason: string;
  readonly sampleIds: readonly string[];
  readonly observedFrom: number;
  readonly observedTo: number;
  readonly validUntil: number;
}

export interface FieldReconstruction {
  readonly field: string;
  readonly frames: number;
  /** Frames recorded without a believed pose at their acquisition: missing, not guessed. */
  readonly framesWithoutPose: number;
  readonly fragments: number;
  readonly tracks: number;
  readonly nodes: readonly ReconstructedNode[];
  readonly strands: readonly ReconstructedStrand[];
  readonly coverage: readonly CoveragePatch[];
  /** The volume the recorded views pointed at (their cones to the range limit). */
  readonly viewedVolume: Volume | null;
}

export interface LatticeReconstruction {
  readonly version: number;
  readonly settingsHash: string;
  readonly fields: readonly FieldReconstruction[];
}

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const addV = (a: Vec3, b: Vec3) => v(a.x + b.x, a.y + b.y, a.z + b.z);
const subV = (a: Vec3, b: Vec3) => v(a.x - b.x, a.y - b.y, a.z - b.z);
const scaleV = (a: Vec3, s: number) => v(a.x * s, a.y * s, a.z * s);
const dotV = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const lenV = (a: Vec3) => Math.sqrt(dotV(a, a));
const unit = (a: Vec3) => scaleV(a, 1 / lenV(a));

/** 3×3 symmetric as row-major 9 numbers. */
type M3 = number[];
const cov3 = (m: M3): Cov3 => [m[0]!, m[1]!, m[2]!, m[4]!, m[5]!, m[8]!];
const fromCov3 = (c: Cov3): M3 => [c[0], c[1], c[2], c[1], c[3], c[4], c[2], c[4], c[5]];
const trace3 = (c: Cov3) => c[0] + c[3] + c[5];

function inv3(m: M3): M3 | null {
  const [a, b, c, d, e, f, g, h, i] = m as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  const scale = Math.abs(a) + Math.abs(e) + Math.abs(i);
  if (!(Math.abs(det) > 1e-14 * scale * scale * scale) || !Number.isFinite(det)) return null;
  const r = 1 / det;
  return [
    A * r,
    -(b * i - c * h) * r,
    (b * f - c * e) * r,
    B * r,
    (a * i - c * g) * r,
    -(a * f - c * d) * r,
    C * r,
    -(a * h - b * g) * r,
    (a * e - b * d) * r,
  ];
}

/** Largest eigenvalue of a symmetric 3×3 (closed form). */
function maxEig3(m: M3): number {
  const [a, b, c, , d, e, , , f] = m as number[];
  const p1 = b! * b! + c! * c! + e! * e!;
  const q = (a! + d! + f!) / 3;
  if (p1 < 1e-30 * (q * q + 1e-300)) return Math.max(a!, d!, f!);
  const p2 = (a! - q) ** 2 + (d! - q) ** 2 + (f! - q) ** 2 + 2 * p1;
  const p = Math.sqrt(p2 / 6);
  const B = [a! - q, b!, c!, b!, d! - q, e!, c!, e!, f! - q].map((x) => x / p);
  const detB =
    B[0]! * (B[4]! * B[8]! - B[5]! * B[7]!) -
    B[1]! * (B[3]! * B[8]! - B[5]! * B[6]!) +
    B[2]! * (B[3]! * B[7]! - B[4]! * B[6]!);
  const r = Math.min(1, Math.max(-1, detB / 2));
  return q + 2 * p * Math.cos(Math.acos(r) / 3);
}

interface Obs {
  readonly frame: number;
  readonly origin: Vec3;
  readonly fI: Vec3;
  readonly rI: Vec3;
  readonly uI: Vec3;
  readonly ray: Vec3;
  readonly s: readonly [number, number];
  /** Effective slope σ (fragment noise, frame-common basis rotation, attitude). */
  readonly sigma: number;
  readonly originCov: Cov3;
  /** Covariance of the believed velocity at that time (the pass's drift), m²/s². */
  readonly velocityCov: Cov3;
  readonly sampleId: string;
  readonly t: number;
  /** The frame's stated range limit, m: nothing farther is in it. */
  readonly rangeLimit: number;
}

interface FrameNodes {
  /** One per fragment endpoint: fragment i's start is 2i, its end 2i + 1. */
  readonly nodes: Obs[];
  /** Each fragment: an observed edge between its endpoints. */
  readonly edges: [number, number][];
  /**
   * Endpoints that coincide in the image (within `nodeMergeSigmas`) share a root: adjacent
   * fragments of one strand share their endpoint, but so may two points far apart in depth
   * that happen to line up. Which it is, the depths decide (`associate`).
   */
  readonly twin: number[];
}

/** One frame's fragment endpoints and edges in the believed inertial frame. */
function frameNodes(pf: PosedFrame, index: number, s: LatticeSettings): FrameNodes {
  const pose = pf.pose!;
  const f = pf.frame;
  const fI = unit(quat.rotate(pose.attitude, f.basis.forward));
  const rI = unit(quat.rotate(pose.attitude, f.basis.right));
  const uI = unit(quat.rotate(pose.attitude, f.basis.up));
  const ends = f.fragments.flatMap((g) => [
    { s: g.start, sigma: g.sigma },
    { s: g.end, sigma: g.sigma },
  ]);
  const parent = ends.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (let i = 0; i < ends.length; i++)
    for (let j = i + 1; j < ends.length; j++) {
      const a = ends[i]!;
      const b = ends[j]!;
      const d = Math.hypot(a.s[0] - b.s[0], a.s[1] - b.s[1]);
      if (d <= s.nodeMergeSigmas * Math.max(a.sigma, b.sigma)) parent[find(i)] = find(j);
    }
  const rot2 = pose.attitudeSigma ** 2 + f.basisSigma ** 2;
  const at = (sx: number, sy: number, sig: number): Obs => {
    const k = 1 + sx * sx + sy * sy;
    return {
      frame: index,
      origin: pose.origin,
      fI,
      rI,
      uI,
      ray: unit(addV(addV(fI, scaleV(rI, sx)), scaleV(uI, sy))),
      s: [sx, sy] as const,
      sigma: Math.sqrt(sig * sig + rot2 * k * k),
      originCov: pose.originCov,
      velocityCov: pose.velocityCov ?? [0, 0, 0, 0, 0, 0],
      sampleId: pf.sampleId,
      t: 0.5 * (f.acquisition[0] + f.acquisition[1]),
      rangeLimit: f.coverage?.rangeLimit ?? Infinity,
    };
  };
  return {
    nodes: ends.map((e) => at(e.s[0], e.s[1], e.sigma)),
    edges: f.fragments.map((_, i) => [2 * i, 2 * i + 1] as [number, number]),
    twin: ends.map((_, i) => find(i)),
  };
}

/**
 * Endpoints of one frame that are one point (twins the depths agree on), as one observation:
 * their mean slopes. Coincident copies are not assumed independent: σ is not reduced.
 */
function combined(obs: readonly Obs[]): Obs {
  if (obs.length === 1) return obs[0]!;
  const o = obs[0]!;
  const sx = obs.reduce((acc, q) => acc + q.s[0], 0) / obs.length;
  const sy = obs.reduce((acc, q) => acc + q.s[1], 0) / obs.length;
  return {
    ...o,
    ray: unit(addV(addV(o.fI, scaleV(o.rI, sx)), scaleV(o.uI, sy))),
    s: [sx, sy] as const,
    sigma: Math.max(...obs.map((q) => q.sigma)),
  };
}

interface Track {
  readonly id: string;
  readonly obs: Obs[];
}

/** Slopes beyond this are not in any camera's view (a 30° half-angle is 0.58); keys stay small. */
const GRID_SPAN = 1e4;

/** A frame's nodes bucketed by slope, for lookups by distance. */
class SlopeGrid {
  private readonly cells = new Map<number, number[]>();
  private readonly lo: [number, number] = [Infinity, Infinity];
  private readonly hi: [number, number] = [-Infinity, -Infinity];
  private readonly nodes: readonly Obs[];
  private readonly cell: number;
  constructor(nodes: readonly Obs[], cell: number) {
    this.nodes = nodes;
    this.cell = cell;
    nodes.forEach((n, i) => {
      const k = Math.floor(n.s[0] / cell) * GRID_SPAN + Math.floor(n.s[1] / cell);
      const list = this.cells.get(k);
      if (list) list.push(i);
      else this.cells.set(k, [i]);
      for (const d of [0, 1] as const) {
        this.lo[d] = Math.min(this.lo[d], n.s[d]);
        this.hi[d] = Math.max(this.hi[d], n.s[d]);
      }
    });
  }
  near(p: readonly [number, number], radius: number): number[] {
    const out: number[] = [];
    if (
      p[0] + radius < this.lo[0] ||
      p[0] - radius > this.hi[0] ||
      p[1] + radius < this.lo[1] ||
      p[1] - radius > this.hi[1]
    )
      return out;
    // Only the cells that hold nodes: a ray far off the frame's axis has a very wide query.
    const c = this.cell;
    const i0 = Math.floor(Math.max(p[0] - radius, this.lo[0]) / c);
    const i1 = Math.floor(Math.min(p[0] + radius, this.hi[0]) / c);
    const j0 = Math.floor(Math.max(p[1] - radius, this.lo[1]) / c);
    const j1 = Math.floor(Math.min(p[1] + radius, this.hi[1]) / c);
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++)
        for (const n of this.cells.get(i * GRID_SPAN + j) ?? []) {
          const q = this.nodes[n]!.s;
          if (Math.hypot(q[0] - p[0], q[1] - p[1]) <= radius) out.push(n);
        }
    return out;
  }
}

/** Where a frame sees an inertial direction, in its slopes; null behind it. */
function slopesOf(d: Vec3, o: Obs): [number, number] | null {
  const a = dotV(d, o.fI);
  if (!(a > 0)) return null;
  return [dotV(d, o.rI) / a, dotV(d, o.uI) / a];
}

/** A candidate partner of an observation: frame, node, and the depth their rays give it, ±σ. */
interface Partner {
  readonly k: number;
  readonly a: number;
  readonly lam: number;
  readonly sig: number;
}

/**
 * Link the frames' nodes into tracks by voting on depth.
 *
 * 3C's sensor rasters a share of its candidates in each frame (96 of several hundred on the
 * Cathedral's twenty fences), so a node returns only every several frames, meanwhile moved by
 * parallax, and the lattice is regular: along the line a node may have moved on (its epipolar
 * line) lie its neighbours on the same strand. Matching each frame to the last (S17's case) made
 * nearly every return a new track (R46).
 *
 * 1. Partners. For each node, the nodes of the frames in the last `associationWindow` seconds
 *    that lie within `associationGate` of its ray and within `associationSigmas` of its epipolar
 *    line (with the believed path's drift between them), crossing it in front of both cameras
 *    and within range. Each gives a depth along its ray.
 * 2. Votes. Only the true point gives the same depth from frame after frame; a neighbour gives a
 *    different depth with each baseline. A node takes the depth the most other frames agree on
 *    (within `associationSigmas`), if at least `associationVotes` do and any depth in conflict
 *    with it has at most `associationRatio` of its support. Otherwise it stays unresolved.
 *    Pairs with no parallax to speak of (depth σ over half the depth) neither vote nor object.
 * 3. Links. Two nodes are linked when each supports the depth the other took; the tracks are
 *    the linked groups. A group that would hold two nodes of one frame is not one point: those
 *    frames' nodes leave it. Competing associations are never settled from a truth mesh.
 */
/**
 * What one rebuild can hand the next, for one attempt (R61): each frame's sightings, each pair of
 * frames' partner links and each sighting's vote. Each result depends only on the frames it was
 * made from, so it is kept under their identity: the frame's id, its place in the pass and its
 * exact believed pose (and, for a vote, its whole partner list). A frame whose pose has changed
 * misses and is recomputed. A rebuild with the memo equals one without it; it only grows with the
 * frames since the last. Entries a rebuild did not use are dropped.
 */
export class LatticeMemo {
  private prev = new Map<string, unknown>();
  private next = new Map<string, unknown>();
  readonly settingsHash: string;
  constructor(settings: LatticeSettings = LATTICE_SETTINGS) {
    this.settingsHash = hashState(settings as unknown as Record<string, number>);
  }
  /** The kept result for `key`, or `make()`'s, kept for the next rebuild either way. */
  get<T>(key: string, make: () => T): T {
    const v = this.next.has(key)
      ? (this.next.get(key) as T)
      : this.prev.has(key)
        ? (this.prev.get(key) as T)
        : make();
    this.next.set(key, v);
    return v;
  }
  private readonly ids = new Map<string, string>();
  /** A short stand-in for a frame's identity (`frameKey`), the same for as long as it is used. */
  idOf(identity: string): string {
    let id = this.ids.get(identity);
    if (id === undefined) {
      id = `f${this.ids.size}`;
      this.ids.set(identity, id);
    }
    return id;
  }
  /** Keep `value` under `key` for the next rebuild, replacing what was there. */
  set(key: string, value: unknown): void {
    this.next.set(key, value);
  }
  /** Whether the last rebuild (or this one) made `key`. */
  has(key: string): boolean {
    return this.next.has(key) || this.prev.has(key);
  }
  /** The end of a rebuild: what it used is what the next may reuse. */
  commit(): void {
    this.prev = this.next;
    this.next = new Map();
  }
}

/** A frame's identity for the memo: its id, its place in the pass and its exact believed pose. */
function frameKey(pf: PosedFrame, k: number): string {
  return `${k}|${pf.sampleId}|${JSON.stringify(pf.pose)}`;
}

/** One partner link between sighting a of frame k and sighting b of an earlier frame. */
type Link = readonly [a: number, b: number, lamA: number, sigA: number, lamB: number, sigB: number];

function associate(
  frames: FrameNodes[],
  frameIds: string[],
  s: LatticeSettings,
  memo?: { readonly memo: LatticeMemo; readonly keys: readonly string[] },
) {
  const grids: (SlopeGrid | undefined)[] = [];
  const gridOf = (k: number) =>
    (grids[k] ??= (() => {
      const fr = frames[k]!;
      const sigMax = Math.max(0, ...fr.nodes.map((o) => o.sigma));
      return new SlopeGrid(fr.nodes, Math.max(Math.min(s.associationGate, 0.02), 4 * sigMax, 1e-3));
    })());
  const partners: Partner[][][] = frames.map((fr) => fr.nodes.map(() => []));
  /** Sightings a pair computed afresh this rebuild touched: their partner lists may differ. */
  const changed: Uint8Array[] = frames.map((fr) => new Uint8Array(fr.nodes.length));
  const cosGate = Math.cos(s.associationGate);
  const g = s.associationSigmas;
  /** The partner links between frame k and an earlier frame k2, in the order they are found. */
  const linksOf = (k: number, k2: number): Link[] => {
    const fr = frames[k]!;
    const other = frames[k2]!;
    const ref = other.nodes[0]!;
    const out: Link[] = [];
    for (let a = 0; a < fr.nodes.length; a++) {
      const na = fr.nodes[a]!;
      const p = slopesOf(na.ray, ref);
      if (!p) continue;
      const stretch = 1 + p[0] * p[0] + p[1] * p[1];
      const base = subV(na.origin, ref.origin);
      const nrm = v(
        base.y * na.ray.z - base.z * na.ray.y,
        base.z * na.ray.x - base.x * na.ray.z,
        base.x * na.ray.y - base.y * na.ray.x,
      );
      const nLen = lenV(nrm);
      if (!(nLen > 1e-9 * (1 + lenV(base)))) continue;
      for (const b of gridOf(k2).near(p, s.associationGate * stretch)) {
        const nb = other.nodes[b]!;
        const cos = dotV(na.ray, nb.ray);
        if (cos < cosGate) continue;
        const den = 1 - cos * cos;
        if (!(den > 1e-14)) continue;
        // Closest approach: depth λ along a's ray, μ along b's.
        const w0 = subV(nb.origin, na.origin);
        const dd = dotV(na.ray, w0);
        const ee = dotV(nb.ray, w0);
        const lam = (dd - cos * ee) / den;
        const mu = (cos * dd - ee) / den;
        const limit = Math.min(na.rangeLimit, nb.rangeLimit);
        if (!(lam > 0 && mu > 0 && lam <= limit && mu <= limit)) continue;
        // Out of the epipolar plane, in angle at b, against the slopes' σ and the drift.
        const e = dotV(nb.ray, nrm) / nLen;
        const drift = (Math.sqrt(trace3(na.velocityCov)) * Math.abs(na.t - nb.t)) / mu;
        const var0 = na.sigma * na.sigma + nb.sigma * nb.sigma + drift * drift;
        if (e * e > g * g * var0) continue;
        const sinG = Math.sqrt(den);
        const spread = Math.sqrt(var0);
        out.push([a, b, lam, (lam * spread) / sinG, mu, (mu * spread) / sinG]);
      }
    }
    return out;
  };
  frames.forEach((fr, k) => {
    if (fr.nodes.length === 0) return;
    for (let k2 = k - 1; k2 >= 0; k2--) {
      const ref = frames[k2]!.nodes[0];
      if (!ref) continue;
      if (fr.nodes[0]!.t - ref.t > s.associationWindow) break;
      const pairKey = memo ? `pair|${memo.keys[k]}|${memo.keys[k2]}` : '';
      const fresh = !memo || !memo.memo.has(pairKey);
      const links = memo ? memo.memo.get(pairKey, () => linksOf(k, k2)) : linksOf(k, k2);
      for (const [a, b, lamA, sigA, lamB, sigB] of links) {
        partners[k]![a]!.push({ k: k2, a: b, lam: lamA, sig: sigA });
        partners[k2]![b]!.push({ k, a, lam: lamB, sig: sigB });
        if (fresh) {
          changed[k]![a] = 1;
          changed[k2]![b] = 1;
        }
      }
    }
  });
  // Votes. Distinct frames are counted with stamps, not sets: each node compares its partners
  // with each other (tens of them), and there are tens of thousands of nodes.
  const chosen: (Set<number> | null)[][] = frames.map((fr) => fr.nodes.map(() => null));
  /** A sighting as one number (frames and sightings per frame stay far below 2¹⁶). */
  const key = (k: number, a: number) => k * 65536 + a;
  const stamp = new Int32Array(frames.length);
  let tick = 0;
  const ag = s.associationDepthSigmas;
  const vote = (C: readonly Partner[]): number[] | null => {
    const n = C.length;
    if (n < s.associationVotes) return null;
    const lam = Float64Array.from(C, (c) => c.lam);
    const sig2 = Float64Array.from(C, (c) => c.sig * c.sig);
    const fk = Int32Array.from(C, (c) => c.k);
    const sigMax = Math.sqrt(Math.max(...sig2));
    const agree = (i: number, j: number) => {
      const d = lam[i]! - lam[j]!;
      return d * d <= ag * ag * (sig2[i]! + sig2[j]!);
    };
    /** The partners whose depth could agree with j's (sorted by depth): [from, to). */
    const span = (j: number): [number, number] => {
      const reach = ag * (Math.sqrt(sig2[j]!) + sigMax);
      let lo = j;
      while (lo > 0 && lam[j]! - lam[lo - 1]! <= reach) lo--;
      let hi = j + 1;
      while (hi < n && lam[hi]! - lam[j]! <= reach) hi++;
      return [lo, hi];
    };
    let best = -1;
    let bestFrames = 0;
    for (let j = 0; j < n; j++) {
      tick++;
      let count = 0;
      const [lo, hi] = span(j);
      for (let i = lo; i < hi; i++)
        if (stamp[fk[i]!] !== tick && agree(i, j)) {
          stamp[fk[i]!] = tick;
          count++;
        }
      if (count > bestFrames || (count === bestFrames && best >= 0 && sig2[j]! < sig2[best]!)) {
        best = j;
        bestFrames = count;
      }
    }
    if (best < 0 || bestFrames < s.associationVotes) return null;
    let rival = 0;
    for (let j = 0; j < n; j++) {
      if (agree(j, best)) continue;
      tick++;
      let count = 0;
      const [lo, hi] = span(j);
      for (let i = lo; i < hi; i++)
        if (stamp[fk[i]!] !== tick && agree(i, j) && !agree(i, best)) {
          stamp[fk[i]!] = tick;
          count++;
        }
      rival = Math.max(rival, count);
    }
    if (rival > s.associationRatio * bestFrames) return null;
    const sup: number[] = [];
    for (let i = 0; i < n; i++) if (agree(i, best)) sup.push(key(C[i]!.k, C[i]!.a));
    return sup;
  };
  frames.forEach((fr, k) =>
    fr.nodes.forEach((_, a) => {
      const choose = () =>
        vote(
          partners[k]![a]!.filter((c) => c.sig <= s.associationDepthPrecision * c.lam).sort(
            (x, y) => x.lam - y.lam,
          ),
        );
      // A sighting no fresh pair touched has the partner list it had last time, so its vote.
      let sup: number[] | null;
      if (!memo) sup = choose();
      else {
        const voteKey = `vote|${memo.keys[k]}|${a}`;
        sup = changed[k]![a] || !memo.memo.has(voteKey) ? choose() : memo.memo.get(voteKey, choose);
        if (changed[k]![a]) memo.memo.set(voteKey, sup);
        else memo.memo.get(voteKey, () => sup);
      }
      if (sup) chosen[k]![a] = new Set(sup);
    }),
  );
  // Links: mutual support. Union–find over every node.
  const offset: number[] = [];
  let total = 0;
  for (const fr of frames) {
    offset.push(total);
    total += fr.nodes.length;
  }
  const parent = Array.from({ length: total }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  frames.forEach((fr, k) =>
    fr.nodes.forEach((_, a) => {
      const sup = chosen[k]![a];
      if (!sup) return;
      for (const p of partners[k]![a]!) {
        if (!sup.has(key(p.k, p.a))) continue;
        if (!chosen[p.k]![p.a]?.has(key(k, a))) continue;
        parent[find(offset[k]! + a)] = find(offset[p.k]! + p.a);
      }
    }),
  );
  const groups = new Map<number, { k: number; a: number }[]>();
  frames.forEach((fr, k) =>
    fr.nodes.forEach((_, a) => {
      const r = find(offset[k]! + a);
      const list = groups.get(r);
      if (list) list.push({ k, a });
      else groups.set(r, [{ k, a }]);
    }),
  );
  const tracks: Track[] = [];
  const trackOf: Track[][] = frames.map(() => []);
  const add = (members: { k: number; a: number }[]) => {
    const first = members[0]!;
    const byFrame = new Map<number, Obs[]>();
    for (const m of members) {
      const list = byFrame.get(m.k);
      const o = frames[m.k]!.nodes[m.a]!;
      if (list) list.push(o);
      else byFrame.set(m.k, [o]);
    }
    const track: Track = {
      id: `${frameIds[first.k]}:node:${first.a}`,
      obs: [...byFrame.values()].map(combined),
    };
    tracks.push(track);
    for (const m of members) trackOf[m.k]![m.a] = track;
  };
  for (const members of groups.values()) {
    members.sort((x, y) => x.k - y.k || x.a - y.a);
    // One point per frame: several endpoints of a frame in one group must be twins (one point
    // drawn twice). Otherwise that frame's endpoints are not this point: they leave it.
    const roots = new Map<number, Set<number>>();
    for (const m of members) {
      const set = roots.get(m.k) ?? new Set<number>();
      set.add(frames[m.k]!.twin[m.a]!);
      roots.set(m.k, set);
    }
    const kept = members.filter((m) => roots.get(m.k)!.size === 1);
    if (kept.length > 0) add(kept);
    for (const m of members) if (roots.get(m.k)!.size > 1) add([m]);
  }
  return { tracks, trackOf };
}

interface Fit {
  readonly X: Vec3;
  readonly Cf: M3;
}

/** Slope residuals (whitened) and their Jacobian at X for observations `obs`. */
function residuals(obs: readonly Obs[], X: Vec3) {
  const r: number[] = [];
  const J: number[][] = [];
  let behind = false;
  for (const o of obs) {
    const w = subV(X, o.origin);
    const a = dotV(w, o.fI);
    if (!(a > 0)) behind = true;
    const sx = dotV(w, o.rI) / a;
    const sy = dotV(w, o.uI) / a;
    r.push((o.s[0] - sx) / o.sigma, (o.s[1] - sy) / o.sigma);
    // d(sx)/dX = (rI − sx fI)/a; residual derivative is minus that, over σ.
    const jx = subV(o.rI, scaleV(o.fI, sx));
    const jy = subV(o.uI, scaleV(o.fI, sy));
    J.push(
      [jx.x, jx.y, jx.z].map((c) => c / (a * o.sigma)),
      [jy.x, jy.y, jy.z].map((c) => c / (a * o.sigma)),
    );
  }
  return { r, J, behind };
}

/** Linear ray intersection, then Gauss–Newton on the slopes (S17's method). */
function triangulate(obs: readonly Obs[]): Fit | 'no-parallax' | 'behind' {
  const A = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const b = [0, 0, 0];
  for (const o of obs) {
    const dd = [o.ray.x, o.ray.y, o.ray.z];
    const oo = [o.origin.x, o.origin.y, o.origin.z];
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) {
        const pij = (i === j ? 1 : 0) - dd[i]! * dd[j]!;
        A[3 * i + j]! += pij;
        b[i]! += pij * oo[j]!;
      }
  }
  const Ai = inv3(A);
  if (!Ai) return 'no-parallax';
  let X = v(
    Ai[0]! * b[0]! + Ai[1]! * b[1]! + Ai[2]! * b[2]!,
    Ai[3]! * b[0]! + Ai[4]! * b[1]! + Ai[5]! * b[2]!,
    Ai[6]! * b[0]! + Ai[7]! * b[1]! + Ai[8]! * b[2]!,
  );
  let Hi: M3 | null = null;
  for (let it = 0; it < 30; it++) {
    const { r, J, behind } = residuals(obs, X);
    if (behind) return 'behind';
    const H = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    const g = [0, 0, 0];
    J.forEach((row, k) => {
      for (let i = 0; i < 3; i++) {
        g[i]! += row[i]! * r[k]!;
        for (let j = 0; j < 3; j++) H[3 * i + j]! += row[i]! * row[j]!;
      }
    });
    Hi = inv3(H);
    if (!Hi) return 'no-parallax';
    const dx = [0, 1, 2].map(
      (i) => Hi![3 * i]! * g[0]! + Hi![3 * i + 1]! * g[1]! + Hi![3 * i + 2]! * g[2]!,
    );
    X = addV(X, v(dx[0]!, dx[1]!, dx[2]!));
    if (Math.hypot(...dx) < 1e-9 * (1 + lenV(subV(X, obs[0]!.origin)))) break;
  }
  const { J, behind } = residuals(obs, X);
  if (behind) return 'behind';
  const H = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const row of J)
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) H[3 * i + j]! += row[i]! * row[j]!;
  Hi = inv3(H);
  if (!Hi || !Hi.every(Number.isFinite)) return 'no-parallax';
  return { X, Cf: Hi };
}

/** Small dense helpers for the joint fit (k ≤ 6 pose parameters). */
const zerosM = (r: number, c: number) =>
  Array.from({ length: r }, () => new Array<number>(c).fill(0));
function invSmall(m: number[][]): number[][] | null {
  const n = m.length;
  const a = m.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r]![c]!) > Math.abs(a[p]![c]!)) p = r;
    if (!(Math.abs(a[p]![c]!) > 1e-300)) return null;
    [a[c], a[p]] = [a[p]!, a[c]!];
    const d = a[c]![c]!;
    for (let j = 0; j < 2 * n; j++) a[c]![j]! /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = a[r]![c]!;
      if (f === 0) continue;
      for (let j = 0; j < 2 * n; j++) a[r]![j]! -= f * a[c]![j]!;
    }
  }
  return a.map((row) => row.slice(n));
}
const m3 = (m: M3): number[][] => [
  [m[0]!, m[1]!, m[2]!],
  [m[3]!, m[4]!, m[5]!],
  [m[6]!, m[7]!, m[8]!],
];

interface Candidate {
  readonly track: Track;
  readonly train: readonly Obs[];
  readonly test: readonly Obs[];
  X: Vec3;
  /** H_pp⁻¹, H_pq and g_p at the last step. */
  A: M3;
  Hpq: number[][];
  gp: number[];
  dead?: string;
}

/**
 * The pass's tracks fitted jointly with the pass's pose error (bundle adjustment): each point,
 * plus an offset δp and, when the believed poses say their velocity is uncertain, a drift δv,
 * so the origins are o + δp + δv (t − t_ref). Both are held by the believed poses' own
 * covariance (the largest over the training observations: conservative). Navigation that
 * drifts during a pass is therefore estimated from the scene, as visual odometry does, and the
 * part the data cannot see (a common translation of everything) stays at its prior, exactly
 * S17's shared pose term. Points are trained on their earlier observations and tested on their
 * later ones; tracks that fail are dropped from the pose estimate and the rest refitted, twice
 * at most, so one wrong association cannot bend the others.
 */
function fitNodes(
  tracks: readonly Track[],
  field: string,
  s: LatticeSettings,
): ReconstructedNode[] {
  const out: ReconstructedNode[] = [];
  const cands: Candidate[] = [];
  const baseOf = (track: Track) => ({
    id: track.id,
    field,
    sampleIds: [...new Set(track.obs.map((o) => o.sampleId))],
    observedFrom: track.obs[0]!.t,
    observedTo: track.obs[track.obs.length - 1]!.t,
  });
  const reject = (
    track: Track,
    reason: string,
    training: number,
    heldOut: number,
  ): ReconstructedNode => ({
    ...baseOf(track),
    position: v(NaN, NaN, NaN),
    covariance: [0, 0, 0, 0, 0, 0],
    formalCovariance: [0, 0, 0, 0, 0, 0],
    training,
    heldOut,
    heldOutRms: NaN,
    supported: false,
    reason,
  });
  for (const track of tracks) {
    const n = track.obs.length;
    if (n < 2) continue;
    const nTest = Math.max(s.minHeldOut, Math.ceil(n * s.heldOutFraction));
    const nTrain = n - nTest;
    if (nTrain < s.minTraining) {
      out.push(reject(track, 'too-few', Math.max(nTrain, 0), Math.min(nTest, n)));
      continue;
    }
    const train = track.obs.slice(0, nTrain);
    const init = triangulate(train);
    if (typeof init === 'string') {
      out.push(reject(track, init, nTrain, nTest));
      continue;
    }
    if (!(maxEig3(init.Cf) <= s.maxPointSigma * s.maxPointSigma)) {
      out.push(reject(track, 'no-parallax', nTrain, nTest));
      continue;
    }
    cands.push({
      track,
      train,
      test: track.obs.slice(nTrain),
      X: init.X,
      A: init.Cf,
      Hpq: [],
      gp: [0, 0, 0],
    });
  }
  if (cands.length === 0) return out;
  // Pose prior: the largest believed offset and drift covariances of the pass.
  let P0: Cov3 = [0, 0, 0, 0, 0, 0];
  let V0: Cov3 = [0, 0, 0, 0, 0, 0];
  let tSum = 0;
  let tN = 0;
  for (const c of cands)
    for (const o of c.train) {
      if (trace3(o.originCov) > trace3(P0)) P0 = o.originCov;
      if (trace3(o.velocityCov) > trace3(V0)) V0 = o.velocityCov;
      tSum += o.t;
      tN++;
    }
  const tRef = tSum / tN;
  const blocks: { cov: Cov3; drift: boolean }[] = [];
  if (trace3(P0) > 0) blocks.push({ cov: P0, drift: false });
  if (trace3(V0) > 0) blocks.push({ cov: V0, drift: true });
  const k = 3 * blocks.length;
  const Lambda = zerosM(k, k);
  for (const [bi, b] of blocks.entries()) {
    const ridge = 1e-12 * trace3(b.cov);
    const inv = inv3(fromCov3(b.cov).map((x, i) => x + (i % 4 === 0 ? ridge : 0)));
    if (!inv)
      return [
        ...out,
        ...cands.map((c) => reject(c.track, 'no-parallax', c.train.length, c.test.length)),
      ];
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) Lambda[3 * bi + i]![3 * bi + j] = inv[3 * i + j]!;
  }
  const q = new Array<number>(k).fill(0);
  /** The origin of an observation under the current pose error. */
  const shifted = (o: Obs): Obs => {
    if (k === 0) return o;
    let d = v(0, 0, 0);
    blocks.forEach((b, bi) => {
      const f = b.drift ? o.t - tRef : 1;
      d = addV(d, v(q[3 * bi]! * f, q[3 * bi + 1]! * f, q[3 * bi + 2]! * f));
    });
    return { ...o, origin: addV(o.origin, d) };
  };
  /** Normal-equation blocks of one candidate's training observations. */
  const blocksOf = (c: Candidate) => {
    const Hpp = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    const Hpq = zerosM(3, k);
    const Hqq = zerosM(k, k);
    const gp = [0, 0, 0];
    const gq = new Array<number>(k).fill(0);
    const { r, J, behind } = residuals(c.train.map(shifted), c.X);
    if (behind) return null;
    J.forEach((row, ri) => {
      const o = c.train[ri >> 1]!;
      // ∂(origin)/∂q: I for the offset, (t − t_ref) I for the drift; the residual moves the
      // opposite way to the point: J_q = −J_X [I, τI].
      const jq = new Array<number>(k).fill(0);
      blocks.forEach((b, bi) => {
        const f = b.drift ? o.t - tRef : 1;
        for (let a = 0; a < 3; a++) jq[3 * bi + a] = -row[a]! * f;
      });
      for (let i = 0; i < 3; i++) {
        gp[i]! += row[i]! * r[ri]!;
        for (let j = 0; j < 3; j++) Hpp[3 * i + j]! += row[i]! * row[j]!;
        for (let j = 0; j < k; j++) Hpq[i]![j]! += row[i]! * jq[j]!;
      }
      for (let i = 0; i < k; i++) {
        gq[i]! += jq[i]! * r[ri]!;
        for (let j = 0; j < k; j++) Hqq[i]![j]! += jq[i]! * jq[j]!;
      }
    });
    const A = inv3(Hpp);
    if (!A) return null;
    return { A, Hpq, Hqq, gp, gq };
  };
  let active = [...cands];
  let Cqq: number[][] = invSmall(Lambda) ?? zerosM(k, k);
  const solveJoint = () => {
    for (let it = 0; it < 20; it++) {
      const S = Lambda.map((row) => [...row]);
      const b = Lambda.map((row) => -row.reduce((acc, x, j) => acc + x * q[j]!, 0));
      const live: Candidate[] = [];
      for (const c of active) {
        const nb = blocksOf(c);
        if (!nb) {
          c.dead = 'behind';
          continue;
        }
        c.A = nb.A;
        c.Hpq = nb.Hpq;
        c.gp = nb.gp;
        live.push(c);
        const A = m3(nb.A);
        // AHpq = A · Hpq (3×k); S += Hqq − Hpqᵀ A Hpq; b += gq − Hpqᵀ A gp.
        const AH = A.map((row) =>
          Array.from({ length: k }, (_, j) =>
            row.reduce((acc, x, l) => acc + x * nb.Hpq[l]![j]!, 0),
          ),
        );
        const Ag = A.map((row) => row.reduce((acc, x, l) => acc + x * nb.gp[l]!, 0));
        for (let i = 0; i < k; i++) {
          b[i]! += nb.gq[i]! - nb.Hpq.reduce((acc, row, l) => acc + row[i]! * Ag[l]!, 0);
          for (let j = 0; j < k; j++)
            S[i]![j]! +=
              nb.Hqq[i]![j]! - nb.Hpq.reduce((acc, row, l) => acc + row[i]! * AH[l]![j]!, 0);
        }
      }
      active = live;
      const Si = k > 0 ? invSmall(S) : [];
      if (!Si) return;
      Cqq = Si;
      const dq = Si.map((row) => row.reduce((acc, x, j) => acc + x * b[j]!, 0));
      for (let i = 0; i < k; i++) q[i]! += dq[i]!;
      let step = Math.hypot(...dq);
      for (const c of active) {
        const rhs = c.gp.map((g, i) => g - c.Hpq[i]!.reduce((acc, x, j) => acc + x * dq[j]!, 0));
        const dX = [0, 1, 2].map(
          (i) => c.A[3 * i]! * rhs[0]! + c.A[3 * i + 1]! * rhs[1]! + c.A[3 * i + 2]! * rhs[2]!,
        );
        c.X = addV(c.X, v(dX[0]!, dX[1]!, dX[2]!));
        step = Math.max(step, Math.hypot(...dX) / (1 + lenV(subV(c.X, c.train[0]!.origin))));
      }
      if (step < 1e-9) break;
    }
  };
  /** Held-out test of one candidate at the current pose error (refitting the point alone). */
  const test = (c: Candidate) => {
    // The point given the current pose error (a few Gauss–Newton steps from where it is).
    for (let it = 0; it < 10; it++) {
      const nb = blocksOf(c);
      if (!nb) {
        c.dead = 'behind';
        return null;
      }
      c.A = nb.A;
      c.Hpq = nb.Hpq;
      c.gp = nb.gp;
      const dX = [0, 1, 2].map(
        (i) =>
          nb.A[3 * i]! * nb.gp[0]! + nb.A[3 * i + 1]! * nb.gp[1]! + nb.A[3 * i + 2]! * nb.gp[2]!,
      );
      c.X = addV(c.X, v(dX[0]!, dX[1]!, dX[2]!));
      if (Math.hypot(...dX) < 1e-9 * (1 + lenV(subV(c.X, c.train[0]!.origin)))) break;
    }
    const held = residuals(c.test.map(shifted), c.X);
    if (held.behind) {
      c.dead = 'behind';
      return null;
    }
    const chi2 = held.r.reduce((acc, x) => acc + x * x, 0);
    const m = held.r.length;
    return { rms: Math.sqrt(chi2 / m), passes: chi2 / m <= 1 + s.heldOutK * Math.sqrt(2 / m) };
  };
  for (let pass = 0; pass < 3; pass++) {
    solveJoint();
    const failing = active.filter((c) => !(test(c)?.passes ?? false));
    if (failing.length === 0 || pass === 2) break;
    const kept = active.filter((c) => !failing.includes(c));
    if (kept.length === 0) break;
    active = kept;
  }
  for (const c of cands) {
    const t = c.dead ? null : test(c);
    if (!t) {
      out.push(reject(c.track, c.dead ?? 'behind', c.train.length, c.test.length));
      continue;
    }
    // C_XX = A + (A Hpq) C_qq (A Hpq)ᵀ: the point given the pose, plus the pose's share.
    const B = m3(c.A).map((row) =>
      Array.from({ length: k }, (_, j) => row.reduce((acc, x, l) => acc + x * c.Hpq[l]![j]!, 0)),
    );
    const C = [...c.A];
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) {
        let x = 0;
        for (let a = 0; a < k; a++)
          for (let bb = 0; bb < k; bb++) x += B[i]![a]! * Cqq[a]![bb]! * B[j]![bb]!;
        C[3 * i + j]! += x;
      }
    out.push({
      ...baseOf(c.track),
      position: c.X,
      covariance: cov3(C),
      formalCovariance: cov3(c.A),
      training: c.train.length,
      heldOut: c.test.length,
      heldOutRms: t.rms,
      supported: t.passes,
      ...(t.passes ? {} : { reason: 'held-out' }),
    });
  }
  return out;
}

/** Chains of supported nodes along observed edges; a branch or an end splits a chain. */
function strands(
  field: string,
  nodes: readonly ReconstructedNode[],
  edgeFrames: ReadonlyMap<string, number>,
  s: LatticeSettings,
  prefix: string,
): ReconstructedStrand[] {
  const byId = new Map(nodes.filter((q) => q.supported).map((q) => [q.id, q]));
  const seen = new Map<string, { other: string; count: number }[]>();
  for (const [key, count] of edgeFrames) {
    if (count < s.minEdgeFrames) continue;
    const [a, b] = key.split('|') as [string, string];
    if (!byId.has(a) || !byId.has(b)) continue;
    seen.set(a, [...(seen.get(a) ?? []), { other: b, count }]);
    seen.set(b, [...(seen.get(b) ?? []), { other: a, count }]);
  }
  // A strand point has a fragment on each side. A third edge at a node is a point that lined up
  // with it in some frames (another strand, another fence): seen in far fewer frames than its
  // own two. At a node with three or more, an edge needs `associationRatio` of the frames of the
  // node's second-best edge, at both its ends. Ambiguity draws less, never more.
  const strong = (a: string, count: number) => {
    const list = seen.get(a)!;
    if (list.length < 3) return true;
    const second = list.map((e) => e.count).sort((x, y) => y - x)[1]!;
    return count >= s.associationRatio * second;
  };
  // [ASSUMED] One processor cuts strands into fragments of comparable length, so an edge far
  // longer than the field's typical one is not one fragment: its ends lined up in some frames
  // (points on two fences, R46). The scale is the data's own: the median supported edge.
  const length = (a: string, b: string) => {
    const p = byId.get(a)!.position;
    const q = byId.get(b)!.position;
    return lenV(subV(p, q));
  };
  const lengths = [...seen].flatMap(([a, list]) =>
    list.filter((e) => a < e.other).map((e) => length(a, e.other)),
  );
  lengths.sort((x, y) => x - y);
  const typical = lengths.length > 0 ? lengths[Math.floor(lengths.length / 2)]! : Infinity;
  const adj = new Map<string, string[]>();
  for (const [a, list] of seen)
    for (const { other: b, count } of list)
      if (strong(a, count) && strong(b, count) && length(a, b) <= s.maxEdgeOverTypical * typical)
        adj.set(a, [...(adj.get(a) ?? []), b]);
  for (const list of adj.values()) list.sort();
  const used = new Set<string>();
  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const chains: string[][] = [];
  const walk = (start: string, next: string) => {
    const chain = [start];
    let prev = start;
    let cur = next;
    used.add(key(start, next));
    for (;;) {
      chain.push(cur);
      const nb = adj.get(cur) ?? [];
      if (nb.length !== 2) break;
      const nxt = nb[0] === prev ? nb[1]! : nb[0]!;
      if (used.has(key(cur, nxt))) break;
      used.add(key(cur, nxt));
      prev = cur;
      cur = nxt;
    }
    chains.push(chain);
  };
  const ids = [...adj.keys()].sort();
  // Start at ends and branches first, then whatever cycles remain.
  for (const id of ids)
    if (adj.get(id)!.length !== 2)
      for (const nb of adj.get(id)!) if (!used.has(key(id, nb))) walk(id, nb);
  for (const id of ids) for (const nb of adj.get(id)!) if (!used.has(key(id, nb))) walk(id, nb);
  return chains.map((chain) => {
    const ns = chain.map((id) => byId.get(id)!);
    const confidence = Math.min(
      ...ns.map((q) => Math.min(1, Math.max(1e-3, Math.exp(-Math.max(0, q.heldOutRms ** 2 - 1))))),
    );
    const sampleIds = [...new Set(ns.flatMap((q) => q.sampleIds))];
    const observedFrom = Math.min(...ns.map((q) => q.observedFrom));
    const observedTo = Math.max(...ns.map((q) => q.observedTo));
    return {
      id: `${prefix}:strand:${chain[0]}`,
      field,
      nodes: chain,
      points: ns.map((q) => q.position),
      sigmaM: Math.sqrt(Math.max(...ns.map((q) => maxEig3(fromCov3(q.covariance))))),
      confidence,
      sampleIds,
      observedFrom,
      observedTo,
      validUntil: observedTo + s.validity,
    };
  });
}

/** The box bounding the recorded views: each camera's cone out to the frame's range limit. */
function viewedVolume(frames: readonly PosedFrame[]): Volume | null {
  let lo = v(Infinity, Infinity, Infinity);
  let hi = v(-Infinity, -Infinity, -Infinity);
  const grow = (p: Vec3) => {
    lo = v(Math.min(lo.x, p.x), Math.min(lo.y, p.y), Math.min(lo.z, p.z));
    hi = v(Math.max(hi.x, p.x), Math.max(hi.y, p.y), Math.max(hi.z, p.z));
  };
  for (const pf of frames) {
    if (!pf.pose) continue;
    const q = pf.pose.attitude;
    const f = unit(quat.rotate(q, pf.frame.basis.forward));
    const r = unit(quat.rotate(q, pf.frame.basis.right));
    const u = unit(quat.rotate(q, pf.frame.basis.up));
    const L = pf.frame.coverage.rangeLimit;
    const t = Math.tan(pf.frame.coverage.halfAngle);
    grow(pf.pose.origin);
    for (const a of [-t, t])
      for (const b of [-t, t]) {
        const d = addV(addV(f, scaleV(r, a)), scaleV(u, b));
        grow(addV(pf.pose.origin, scaleV(d, L / lenV(d))));
      }
  }
  if (!Number.isFinite(lo.x)) return null;
  return {
    center: scaleV(addV(lo, hi), 0.5),
    halfSize: v(
      Math.max(0.5 * (hi.x - lo.x), 1e-3),
      Math.max(0.5 * (hi.y - lo.y), 1e-3),
      Math.max(0.5 * (hi.z - lo.z), 1e-3),
    ),
  };
}

/**
 * Rebuild every field's lattice from posed frames (already in canonical acquisition order).
 * `prefix` scopes identities to the attempt (lineage): `<attempt id>`.
 */
export function reconstructLattice(
  frames: readonly PosedFrame[],
  prefix: string,
  settings: LatticeSettings = LATTICE_SETTINGS,
  /** The last rebuild's work for this attempt (`LatticeMemo`); the result is the same without. */
  memo?: LatticeMemo,
): LatticeReconstruction {
  const settingsHash = hashState(settings as unknown as Record<string, number>);
  const reuse = memo && memo.settingsHash === settingsHash ? memo : undefined;
  const fieldIds = [...new Set(frames.map((f) => f.frame.field))].sort();
  const out: FieldReconstruction[] = fieldIds.map((field) => {
    const mine = frames.filter((f) => f.frame.field === field);
    const posed = mine.filter((f) => f.pose !== null);
    const keys = reuse ? posed.map((pf, k) => reuse.idOf(frameKey(pf, k))) : [];
    const fn = posed.map((pf, k) =>
      reuse
        ? reuse.get(`nodes|${keys[k]}`, () => frameNodes(pf, k, settings))
        : frameNodes(pf, k, settings),
    );
    const { tracks, trackOf } = associate(
      fn,
      posed.map((pf) => `${prefix}:${pf.frame.id}`),
      settings,
      reuse ? { memo: reuse, keys } : undefined,
    );
    const nodes = fitNodes(tracks, field, settings);
    const edgeFrames = new Map<string, number>();
    fn.forEach((fr, k) => {
      const seen = new Set<string>();
      for (const [a, b] of fr.edges) {
        const ta = trackOf[k]![a]!.id;
        const tb = trackOf[k]![b]!.id;
        if (ta === tb) continue;
        const key = ta < tb ? `${ta}|${tb}` : `${tb}|${ta}`;
        if (seen.has(key)) continue;
        seen.add(key);
        edgeFrames.set(key, (edgeFrames.get(key) ?? 0) + 1);
      }
    });
    const st = strands(field, nodes, edgeFrames, settings, `${prefix}:${field}`);
    const viewed = viewedVolume(posed);
    const coverage: CoveragePatch[] =
      viewed && posed.length > 0
        ? [
            {
              id: `${prefix}:${field}:coverage:viewed`,
              ...viewed,
              status: 'unresolved',
              reason:
                'Angular detections cannot certify an empty opening: no calibrated detection model has qualified this volume.',
              sampleIds: posed.map((pf) => pf.sampleId),
              observedFrom: Math.min(...posed.map((pf) => pf.frame.acquisition[0])),
              observedTo: Math.max(...posed.map((pf) => pf.frame.acquisition[1])),
              validUntil:
                Math.max(...posed.map((pf) => pf.frame.acquisition[1])) + settings.validity,
            },
          ]
        : [];
    return {
      field,
      frames: mine.length,
      framesWithoutPose: mine.length - posed.length,
      fragments: posed.reduce((acc, pf) => acc + pf.frame.fragments.length, 0),
      tracks: tracks.length,
      nodes,
      strands: st,
      coverage,
      viewedVolume: viewed,
    };
  });
  reuse?.commit();
  return {
    version: LATTICE_RECONSTRUCTION_VERSION,
    settingsHash,
    fields: out,
  };
}
