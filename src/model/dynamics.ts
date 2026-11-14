/**
 * Believed dynamics and measurement prediction (1G spec §2, §3, §4.2).
 *
 * Planar, inertial gauge frame (§3.4): the first body of a structure (the primary) sits at the
 * origin, at rest, at the arc epoch. Bodies attract each other and the ship under the P4 law
 * a = (μ / r0²)(r0 / r)ⁿ; the ship is a massless test particle that also feels commanded
 * thrust, optional local gravity scales (Tier L), calibration profiles (§5.4, §8.2) and
 * empirical accelerations (§6.4).
 *
 * Fixed-step RK4 (step `dt`, the reference uses 60 s). Thrust-segment and empirical-window
 * boundaries are integration nodes; measurement times between nodes are reached by a
 * sub-step from the preceding node, so the trajectory itself does not depend on which
 * times are recorded. Belief side: never imports src/sim or truth (P11).
 */

/**
 * A number, the name of a parameter, or a list of refs whose values add (an arrival value plus
 * a per-arc deviation, §3.7). Names may contain "{att}", replaced by the arc id.
 */
export type Ref = number | string | readonly Ref[];

export interface BodyDef {
  readonly id: string;
  readonly mu: Ref;
  /** 'gauge' for the primary (origin, at rest at the epoch); otherwise x, y, vx, vy refs. */
  readonly state: 'gauge' | readonly [Ref, Ref, Ref, Ref];
  /** Fixed state per arc id, overriding `state` (other bodies frozen in Tier L fits). */
  readonly stateByArc?: Readonly<Record<string, readonly [number, number, number, number]>>;
  /** Local scale on this body's pull on the ship (Tier L, §5.2). Default 1. */
  readonly gs?: Ref;
  /** Local slope: scale = gs + gs1·(ln r − gsU0) (present-state fit, §8.1). Default 0. */
  readonly gs1?: Ref;
  readonly gsU0?: number;
}

/**
 * Empirical acceleration (§6.4): piecewise-constant radial/tangential components relative to
 * body `ref`. bounds[arc] lists window start times then the final end time; window k covers
 * [bounds[k], bounds[k+1]). Parameters "{att}.emp{k}.R" and "{att}.emp{k}.T".
 */
export interface EmpDef {
  readonly ref: string;
  readonly bounds: Readonly<Record<string, readonly number[]>>;
}

/**
 * Calibration profile for one body's pull on the ship (§5.4, §8.2). With u = ln r clipped to
 * [ln rMin, ln rMax] the pull is multiplied by g(u)·exp(−ηe·Le(r) − η·(L(r) − Le(r))); g is
 * piecewise linear on uNodes (absolute ln r) with values gNodes[b] + dNodes[b]; L(r) = ln(r/rMax)
 * above the covered range, ln(r/rMin) below it, 0 inside; Le is the part of that stretch of
 * ln r inside the validated spans of an adopted rule (§7.4), signed like L.
 */
export interface ProfileDef {
  readonly body: string;
  readonly uNodes: readonly number[];
  readonly gNodes: readonly number[];
  readonly rMin: number;
  readonly rMax: number;
  readonly dNodes?: readonly Ref[];
  /** Default hedge exponent η (outside validated spans). */
  readonly eta?: Ref;
  /** Earned hedge exponent ηe (inside validated spans). */
  readonly etaE?: Ref;
  /** Validated distance spans [lo, hi] in m (merged, disjoint). */
  readonly validated?: readonly (readonly [number, number])[];
}

export interface EngineDef {
  /** Thrust scale (also absorbs mass error). */
  readonly kE: Ref;
  /** Thrust misalignment, rad. */
  readonly dE: Ref;
}

export interface Structure {
  readonly r0: number;
  /** Distance-law exponent n. */
  readonly n: Ref;
  readonly bodies: readonly BodyDef[];
  /** Ship x, y, vx, vy at the arc epoch. */
  readonly ship: readonly [Ref, Ref, Ref, Ref];
  /** Bodies attract each other (only meaningful with two or more bodies). */
  readonly dynamicBodies: boolean;
  /** Default engine; segments naming a thruster in `engines` use that entry instead. */
  readonly engine: EngineDef;
  readonly engines?: Readonly<Record<string, EngineDef>>;
  /** Accelerometer scale. */
  readonly kA: Ref;
  /** Camera bearing bias, rad. */
  readonly camBias: Ref;
  readonly emp?: EmpDef;
  readonly profiles?: readonly ProfileDef[];
}

export const SHIP_REFS: readonly [Ref, Ref, Ref, Ref] = [
  '{att}.ship.x',
  '{att}.ship.y',
  '{att}.ship.vx',
  '{att}.ship.vy',
];

/** Commanded thrust over [t0, t1) (§3.3). */
export interface ThrustSegment {
  readonly t0: number;
  readonly t1: number;
  /** Commanded thrust acceleration (force / believed mass), m/s². */
  readonly u: number;
  /** Inertial direction of the commanded thrust, rad (attitude + mount angle). */
  readonly theta: number;
  /** Direction of the thrust in the body frame, rad (0 for the main engine). Default 0. */
  readonly bodyAngle?: number;
  /** Thruster id, selecting Structure.engines. */
  readonly thruster?: string;
  /** Extra scale for a segment whose level is uncertain (a `limited` burn). */
  readonly scale?: Ref;
}

export type EstMeasurement =
  /** Optical fix: z = [bearing] or [bearing, range]. */
  | {
      readonly kind: 'opnav';
      readonly t: number;
      readonly target: string;
      readonly z: readonly number[];
      readonly sigma: readonly number[];
    }
  /** Range without a bearing: z = [ρ]. */
  | {
      readonly kind: 'range';
      readonly t: number;
      readonly target: string;
      readonly z: readonly number[];
      readonly sigma: readonly number[];
    }
  /** Ship minus target, inertial: z = [x, y]. */
  | {
      readonly kind: 'relpos';
      readonly t: number;
      readonly target: string;
      readonly z: readonly number[];
      readonly sigma: readonly number[];
    }
  /** Non-gravitational specific force, body frame: z = [fx, fy]. Used only while thrusting. */
  | {
      readonly kind: 'accel';
      readonly t: number;
      readonly target?: undefined;
      readonly z: readonly number[];
      readonly sigma: readonly number[];
    };

/**
 * A fitted arc: the structure, parameter vector and index it was fitted with, and the
 * posterior covariance of the parameters that move it (Tier G, an arc fit, or a window fit).
 */
export interface ArcSolution {
  readonly arc: Pick<Arc, 'id' | 'epoch' | 'commands' | 'meas'>;
  readonly structure: Structure;
  readonly x: Float64Array;
  readonly idx: ReadonlyMap<string, number>;
  /** Posterior covariance aligned with x (null: unknown, treated as zero). */
  readonly P: { readonly rows: number; readonly cols: number; readonly data: Float64Array } | null;
  /** Indices of the parameters that affect this arc. */
  readonly rel: readonly number[];
  /** Finite-difference scales aligned with x. */
  readonly scale: Float64Array;
}

/** One continuous stretch of one attempt (§3.5). */
export interface Arc {
  readonly id: string;
  /** State parameters are defined at this time. */
  readonly epoch: number;
  readonly commands: readonly ThrustSegment[];
  readonly meas: readonly EstMeasurement[];
}

export const TWO_PI = 2 * Math.PI;

/** Wrap to [−π, π) (numpy-compatible modulo). */
export function wrap(a: number): number {
  const m = (a + Math.PI) % TWO_PI;
  return (m < 0 ? m + TWO_PI : m) - Math.PI;
}

const EPS_T = 1e-6;

/** Is thrust commanded at t (any segment with t0 ≤ t < t1 and u ≠ 0)? */
export function poweredAt(commands: readonly ThrustSegment[], t: number): boolean {
  for (const c of commands) if (c.t0 <= t + EPS_T && t < c.t1 - EPS_T && c.u !== 0) return true;
  return false;
}

/** Does the structure model this measurement (accel always; others need a modelled target)? */
export function usable(st: Structure, m: EstMeasurement): boolean {
  if (m.kind === 'accel') return true;
  return st.bodies.some((b) => b.id === m.target);
}

// ---------------------------------------------------------------------------------------------
// Compilation: refs → slots (constant or parameter index) for one arc
// ---------------------------------------------------------------------------------------------

/** ≥ 0: parameter index; < 0: constant in a side table; array: sum of slots. */
type Slot = number | readonly Slot[];

interface Slots {
  readonly consts: number[];
}

function slotOf(ref: Ref, idx: ReadonlyMap<string, number>, arcId: string, s: Slots): Slot {
  if (typeof ref === 'object') return ref.map((r) => slotOf(r, idx, arcId, s));
  if (typeof ref === 'number') {
    s.consts.push(ref);
    return -s.consts.length; // −1, −2, …
  }
  const name = ref.replaceAll('{att}', arcId);
  const i = idx.get(name);
  if (i === undefined) throw new Error(`dynamics: unknown parameter ${name}`);
  return i;
}

interface CompiledSegment {
  readonly t0: number;
  readonly t1: number;
  readonly u: number;
  readonly theta: number;
  readonly bodyAngle: number;
  readonly kE: Slot;
  readonly dE: Slot;
  readonly scale: Slot | null;
}

interface CompiledProfile {
  readonly body: number;
  readonly un: Float64Array;
  readonly g: Float64Array;
  readonly dn: Slot[] | null;
  readonly lmin: number;
  readonly lmax: number;
  readonly eta: Slot;
  readonly etaE: Slot;
  /** Validated spans in ln r. */
  readonly spans: readonly (readonly [number, number])[];
}

export interface CompiledArc {
  readonly arcId: string;
  readonly epoch: number;
  readonly r0: number;
  readonly nb: number;
  readonly bodyIndex: ReadonlyMap<string, number>;
  readonly consts: Float64Array;
  readonly n: Slot;
  readonly mu: readonly Slot[];
  readonly bodyState: readonly (readonly Slot[] | null)[];
  readonly gs: readonly ({ g0: Slot; g1: Slot; u0: number } | null)[];
  readonly ship: readonly Slot[];
  readonly dyn: boolean;
  readonly kA: Slot;
  readonly cam: Slot;
  readonly segments: readonly CompiledSegment[];
  readonly emp: { ref: number; aR: Slot[]; aT: Slot[]; inner: Float64Array } | null;
  readonly profiles: readonly CompiledProfile[];
  /** Sorted node times other than the regular grid (segment and empirical boundaries). */
  readonly breaks: Float64Array;
}

export function compileArc(
  st: Structure,
  arc: Pick<Arc, 'id' | 'epoch' | 'commands'>,
  idx: ReadonlyMap<string, number>,
): CompiledArc {
  const s: Slots = { consts: [] };
  const sl = (r: Ref) => slotOf(r, idx, arc.id, s);
  const bodyIndex = new Map<string, number>();
  st.bodies.forEach((b, i) => bodyIndex.set(b.id, i));
  const plainGs = (b: BodyDef) =>
    (b.gs === undefined || b.gs === 1) && (b.gs1 === undefined || b.gs1 === 0);
  const engineFor = (thr?: string) => (thr !== undefined && st.engines?.[thr]) || st.engine;
  const segments: CompiledSegment[] = arc.commands.map((c) => {
    const e = engineFor(c.thruster);
    return {
      t0: c.t0,
      t1: c.t1,
      u: c.u,
      theta: c.theta,
      bodyAngle: c.bodyAngle ?? 0,
      kE: sl(e.kE),
      dE: sl(e.dE),
      scale: c.scale === undefined ? null : sl(c.scale),
    };
  });
  let emp: CompiledArc['emp'] = null;
  const breaks: number[] = [];
  for (const c of arc.commands) breaks.push(c.t0, c.t1);
  if (st.emp) {
    const bnd = st.emp.bounds[arc.id];
    if (!bnd) throw new Error(`dynamics: no empirical bounds for arc ${arc.id}`);
    const nseg = bnd.length - 1;
    const aR: Slot[] = [];
    const aT: Slot[] = [];
    for (let k = 0; k < nseg; k++) {
      aR.push(sl(`{att}.emp${k}.R`));
      aT.push(sl(`{att}.emp${k}.T`));
    }
    const ref = bodyIndex.get(st.emp.ref);
    if (ref === undefined)
      throw new Error(`dynamics: empirical frame body ${st.emp.ref} not modelled`);
    const inner = Float64Array.from(bnd.slice(1, -1));
    for (const b of inner) breaks.push(b);
    emp = { ref, aR, aT, inner };
  }
  const profiles: CompiledProfile[] = (st.profiles ?? []).map((p) => {
    const body = bodyIndex.get(p.body);
    if (body === undefined) throw new Error(`dynamics: profile body ${p.body} not modelled`);
    if (p.uNodes.length < 2) throw new Error('dynamics: a profile needs at least two nodes');
    return {
      body,
      un: Float64Array.from(p.uNodes),
      g: Float64Array.from(p.gNodes),
      dn: p.dNodes ? p.dNodes.map(sl) : null,
      lmin: Math.log(p.rMin),
      lmax: Math.log(p.rMax),
      eta: sl(p.eta ?? 0),
      etaE: sl(p.etaE ?? 0),
      spans: (p.validated ?? []).map(([lo, hi]) => [Math.log(lo), Math.log(hi)] as const),
    };
  });
  const compiled = {
    arcId: arc.id,
    epoch: arc.epoch,
    r0: st.r0,
    nb: st.bodies.length,
    bodyIndex,
    n: sl(st.n),
    mu: st.bodies.map((b) => sl(b.mu)),
    bodyState: st.bodies.map((b) => {
      const fixed = b.stateByArc?.[arc.id];
      if (fixed) return fixed.map(sl);
      return b.state === 'gauge' ? null : b.state.map(sl);
    }),
    gs: st.bodies.map((b) =>
      plainGs(b) ? null : { g0: sl(b.gs ?? 1), g1: sl(b.gs1 ?? 0), u0: b.gsU0 ?? 0 },
    ),
    ship: st.ship.map(sl),
    dyn: st.dynamicBodies && st.bodies.length > 1,
    kA: sl(st.kA),
    cam: sl(st.camBias),
    segments,
    emp,
    profiles,
    breaks: Float64Array.from([...new Set(breaks)].sort((a, b) => a - b)),
    consts: new Float64Array(0),
  };
  return { ...compiled, consts: Float64Array.from(s.consts) };
}

function val(ca: CompiledArc, slot: Slot, x: ArrayLike<number>): number {
  if (typeof slot === 'object') {
    let v = 0;
    for (const q of slot) v += val(ca, q, x);
    return v;
  }
  return slot >= 0 ? x[slot]! : ca.consts[-slot - 1]!;
}

// ---------------------------------------------------------------------------------------------
// Propagation
// ---------------------------------------------------------------------------------------------

export interface Trajectory {
  /** Requested times (ascending). */
  readonly times: readonly number[];
  /** Per time, particle positions [x0, y0, x1, y1, …]; bodies first, ship last. */
  readonly pos: readonly Float64Array[];
  readonly vel: readonly Float64Array[];
}

interface Resolved {
  readonly r0: number;
  readonly n: number;
  readonly mu: Float64Array;
  readonly gs: ({ g0: number; g1: number; u0: number } | null)[];
  readonly prof: ({
    un: Float64Array;
    g: Float64Array;
    lmin: number;
    lmax: number;
    eta: number;
    etaE: number;
    spans: readonly (readonly [number, number])[];
  } | null)[];
  readonly segKE: Float64Array;
  readonly segDE: Float64Array;
  readonly segScale: Float64Array;
  readonly empR: Float64Array | null;
  readonly empT: Float64Array | null;
}

function resolve(ca: CompiledArc, x: ArrayLike<number>): Resolved {
  const v = (s: Slot) => val(ca, s, x);
  const prof: Resolved['prof'] = new Array(ca.nb).fill(null);
  for (const p of ca.profiles) {
    const g = new Float64Array(p.g);
    if (p.dn) for (let b = 0; b < g.length; b++) g[b]! += v(p.dn[b]!);
    prof[p.body] = {
      un: p.un,
      g,
      lmin: p.lmin,
      lmax: p.lmax,
      eta: v(p.eta),
      etaE: v(p.etaE),
      spans: p.spans,
    };
  }
  return {
    r0: ca.r0,
    n: v(ca.n),
    mu: Float64Array.from(ca.mu, v),
    gs: ca.gs.map((g) => (g ? { g0: v(g.g0), g1: v(g.g1), u0: g.u0 } : null)),
    prof,
    segKE: Float64Array.from(ca.segments, (s) => v(s.kE)),
    segDE: Float64Array.from(ca.segments, (s) => v(s.dE)),
    segScale: Float64Array.from(ca.segments, (s) => (s.scale === null ? 1 : v(s.scale))),
    empR: ca.emp ? Float64Array.from(ca.emp.aR, v) : null,
    empT: ca.emp ? Float64Array.from(ca.emp.aT, v) : null,
  };
}

function activeAt(seg: { t0: number; t1: number }, t: number): boolean {
  return seg.t0 <= t + EPS_T && t < seg.t1 - EPS_T;
}

/**
 * Propagate bodies and ship from the arc epoch with parameters x and return positions and
 * velocities at the requested times (ascending, ≥ epoch).
 */
export function simulate(
  ca: CompiledArc,
  x: ArrayLike<number>,
  times: readonly number[],
  dt: number,
): Trajectory {
  const R = resolve(ca, x);
  const nb = ca.nb;
  const N = nb + 1;
  const ship = nb;
  const dim = 2 * N;
  const P = new Float64Array(dim);
  const V = new Float64Array(dim);
  for (let i = 0; i < nb; i++) {
    const st = ca.bodyState[i];
    if (st) {
      P[2 * i] = val(ca, st[0]!, x);
      P[2 * i + 1] = val(ca, st[1]!, x);
      V[2 * i] = val(ca, st[2]!, x);
      V[2 * i + 1] = val(ca, st[3]!, x);
    }
  }
  P[2 * ship] = val(ca, ca.ship[0]!, x);
  P[2 * ship + 1] = val(ca, ca.ship[1]!, x);
  V[2 * ship] = val(ca, ca.ship[2]!, x);
  V[2 * ship + 1] = val(ca, ca.ship[3]!, x);

  const out: Trajectory = { times, pos: [], vel: [] };
  if (times.length === 0) return out;
  const tEnd = times[times.length - 1]!;
  if (times[0]! < ca.epoch - EPS_T) throw new Error('simulate: requested time before the epoch');

  // Integration nodes: regular grid from the epoch, plus breaks inside (epoch, tEnd].
  const nodes: number[] = [];
  for (let k = 0; ; k++) {
    const t = ca.epoch + k * dt;
    if (t > tEnd + EPS_T) break;
    nodes.push(t);
  }
  if (ca.breaks.length > 0) {
    for (const b of ca.breaks) if (b > ca.epoch + EPS_T && b <= tEnd + EPS_T) nodes.push(b);
    nodes.sort((a, b) => a - b);
    let w = 1;
    for (let r = 1; r < nodes.length; r++)
      if (nodes[r]! - nodes[w - 1]! > EPS_T) nodes[w++] = nodes[r]!;
    nodes.length = w;
  }

  const r0sq = R.r0 * R.r0;
  const thr = new Float64Array(2);
  let empSeg = 0;

  const accel = (p: Float64Array, a: Float64Array) => {
    a.fill(0);
    if (ca.dyn) {
      for (let i = 0; i < nb; i++) {
        for (let j = 0; j < nb; j++) {
          if (i === j) continue;
          const dx = p[2 * j]! - p[2 * i]!;
          const dy = p[2 * j + 1]! - p[2 * i + 1]!;
          const r = Math.sqrt(dx * dx + dy * dy);
          const k = ((R.mu[j]! / r0sq) * Math.pow(R.r0 / r, R.n)) / r;
          a[2 * i]! += dx * k;
          a[2 * i + 1]! += dy * k;
        }
      }
    }
    const sx = p[2 * ship]!;
    const sy = p[2 * ship + 1]!;
    let ax = 0;
    let ay = 0;
    for (let j = 0; j < nb; j++) {
      const dx = p[2 * j]! - sx;
      const dy = p[2 * j + 1]! - sy;
      const rr = dx * dx + dy * dy;
      const r = Math.sqrt(rr);
      let k = ((R.mu[j]! / r0sq) * Math.pow(R.r0 / r, R.n)) / r;
      const gs = R.gs[j];
      const pf = R.prof[j];
      if (gs || pf) {
        const lr = 0.5 * Math.log(rr);
        if (gs) k *= gs.g0 + gs.g1 * (lr - gs.u0);
        if (pf) {
          const nn = pf.un.length;
          const uc = Math.min(Math.max(lr, pf.lmin), pf.lmax);
          const xq = Math.min(Math.max((uc - pf.un[0]!) / (pf.un[1]! - pf.un[0]!), 0), nn - 1);
          const i0 = Math.min(Math.floor(xq), nn - 2);
          const wq = xq - i0;
          const mult = (1 - wq) * pf.g[i0]! + wq * pf.g[i0 + 1]!;
          const L = lr > pf.lmax ? lr - pf.lmax : lr < pf.lmin ? lr - pf.lmin : 0;
          if (L === 0) k *= mult;
          else {
            // Part of the stretch from the covered edge to r inside validated spans (§8.2).
            let Le = 0;
            for (const [vlo, vhi] of pf.spans) {
              if (lr < pf.lmin) Le -= Math.max(Math.min(vhi, pf.lmin) - Math.max(vlo, lr), 0);
              else Le += Math.max(Math.min(vhi, lr) - Math.max(vlo, pf.lmax), 0);
            }
            k *= mult * Math.exp(-pf.etaE * Le - pf.eta * (L - Le));
          }
        }
      }
      ax += dx * k;
      ay += dy * k;
    }
    ax += thr[0]!;
    ay += thr[1]!;
    if (ca.emp) {
      const ref = ca.emp.ref;
      const dx = sx - p[2 * ref]!;
      const dy = sy - p[2 * ref + 1]!;
      const r = Math.sqrt(dx * dx + dy * dy);
      const rx = dx / r;
      const ry = dy / r;
      const aR = R.empR![empSeg]!;
      const aT = R.empT![empSeg]!;
      ax += aR * rx - aT * ry;
      ay += aR * ry + aT * rx;
    }
    a[2 * ship] = ax;
    a[2 * ship + 1] = ay;
  };

  const a1 = new Float64Array(dim);
  const a2 = new Float64Array(dim);
  const a3 = new Float64Array(dim);
  const a4 = new Float64Array(dim);
  const P2 = new Float64Array(dim);
  const V2 = new Float64Array(dim);
  const P3 = new Float64Array(dim);
  const V3 = new Float64Array(dim);
  const P4 = new Float64Array(dim);
  const V4 = new Float64Array(dim);

  /** One RK4 step of size h from (p, v) into (po, vo). */
  const rk4 = (p: Float64Array, v: Float64Array, h: number, po: Float64Array, vo: Float64Array) => {
    accel(p, a1);
    for (let i = 0; i < dim; i++) {
      P2[i] = p[i]! + 0.5 * h * v[i]!;
      V2[i] = v[i]! + 0.5 * h * a1[i]!;
    }
    accel(P2, a2);
    for (let i = 0; i < dim; i++) {
      P3[i] = p[i]! + 0.5 * h * V2[i]!;
      V3[i] = v[i]! + 0.5 * h * a2[i]!;
    }
    accel(P3, a3);
    for (let i = 0; i < dim; i++) {
      P4[i] = p[i]! + h * V3[i]!;
      V4[i] = v[i]! + h * a3[i]!;
    }
    accel(P4, a4);
    for (let i = 0; i < dim; i++) {
      po[i] = p[i]! + (h / 6) * (v[i]! + 2 * V2[i]! + 2 * V3[i]! + V4[i]!);
      vo[i] = v[i]! + (h / 6) * (a1[i]! + 2 * a2[i]! + 2 * a3[i]! + a4[i]!);
    }
  };

  const setInterval = (t: number) => {
    thr[0] = 0;
    thr[1] = 0;
    for (let s = 0; s < ca.segments.length; s++) {
      const seg = ca.segments[s]!;
      if (seg.u === 0 || !activeAt(seg, t)) continue;
      const mag = R.segScale[s]! * R.segKE[s]! * seg.u;
      const ang = seg.theta + R.segDE[s]!;
      thr[0]! += mag * Math.cos(ang);
      thr[1]! += mag * Math.sin(ang);
    }
    if (ca.emp) {
      let s = 0;
      while (s < ca.emp.inner.length && ca.emp.inner[s]! <= t + EPS_T) s++;
      empSeg = s;
    }
  };

  const Ps = new Float64Array(dim);
  const Vs = new Float64Array(dim);
  const pos: Float64Array[] = [];
  const vel: Float64Array[] = [];
  let ri = 0;
  for (let i = 0; i < nodes.length; i++) {
    const ti = nodes[i]!;
    const tn = i + 1 < nodes.length ? nodes[i + 1]! : Infinity;
    setInterval(ti);
    while (ri < times.length && times[ri]! < tn - EPS_T) {
      const tr = times[ri]!;
      if (Math.abs(tr - ti) <= EPS_T) {
        pos.push(new Float64Array(P));
        vel.push(new Float64Array(V));
      } else {
        rk4(P, V, tr - ti, Ps, Vs);
        pos.push(new Float64Array(Ps));
        vel.push(new Float64Array(Vs));
      }
      ri++;
    }
    if (i + 1 < nodes.length) rk4(P, V, tn - ti, P, V);
  }
  return { times, pos, vel };
}

// ---------------------------------------------------------------------------------------------
// Measurement prediction
// ---------------------------------------------------------------------------------------------

export interface Flat {
  readonly z: Float64Array;
  readonly s: Float64Array;
  readonly isAngle: Uint8Array;
  /** Per scalar: measurement index and component. */
  readonly meta: readonly (readonly [number, number])[];
}

/** Scalar view of measurements. */
export function flatten(meas: readonly EstMeasurement[]): Flat {
  const z: number[] = [];
  const s: number[] = [];
  const ang: number[] = [];
  const meta: [number, number][] = [];
  meas.forEach((m, i) => {
    for (let c = 0; c < m.z.length; c++) {
      z.push(m.z[c]!);
      s.push(m.sigma[c]!);
      ang.push(m.kind === 'opnav' && c === 0 ? 1 : 0);
      meta.push([i, c]);
    }
  });
  return {
    z: Float64Array.from(z),
    s: Float64Array.from(s),
    isAngle: Uint8Array.from(ang),
    meta,
  };
}

/** Distinct sorted times of the measurements and, per measurement, its index into them. */
export function timeIndex(meas: readonly EstMeasurement[]): { times: number[]; at: Int32Array } {
  const times = [...new Set(meas.map((m) => m.t))].sort((a, b) => a - b);
  const pos = new Map<number, number>();
  times.forEach((t, i) => pos.set(t, i));
  return { times, at: Int32Array.from(meas, (m) => pos.get(m.t)!) };
}

/** Predicted scalar measurements (in flatten() order). */
export function predict(
  ca: CompiledArc,
  x: ArrayLike<number>,
  meas: readonly EstMeasurement[],
  ti: { times: number[]; at: Int32Array },
  dt: number,
  out?: Float64Array,
): Float64Array {
  const needsTraj = meas.some((m) => m.kind !== 'accel');
  const traj = needsTraj ? simulate(ca, x, ti.times, dt) : null;
  const ship = ca.nb;
  let total = 0;
  for (const m of meas) total += m.z.length;
  const res = out ?? new Float64Array(total);
  let c = 0;
  let segKE: Float64Array | null = null;
  let segDE: Float64Array | null = null;
  let segScale: Float64Array | null = null;
  let kA = 1;
  for (let i = 0; i < meas.length; i++) {
    const m = meas[i]!;
    if (m.kind === 'accel') {
      if (!segKE) {
        segKE = Float64Array.from(ca.segments, (s) => val(ca, s.kE, x));
        segDE = Float64Array.from(ca.segments, (s) => val(ca, s.dE, x));
        segScale = Float64Array.from(ca.segments, (s) =>
          s.scale === null ? 1 : val(ca, s.scale, x),
        );
        kA = val(ca, ca.kA, x);
      }
      let fx = 0;
      let fy = 0;
      for (let s = 0; s < ca.segments.length; s++) {
        const seg = ca.segments[s]!;
        if (seg.u === 0 || !activeAt(seg, m.t)) continue;
        const f = kA * segScale![s]! * segKE[s]! * seg.u;
        const ang = seg.bodyAngle + segDE![s]!;
        fx += f * Math.cos(ang);
        fy += f * Math.sin(ang);
      }
      res[c++] = fx;
      res[c++] = fy;
      continue;
    }
    const p = traj!.pos[ti.at[i]!]!;
    const j = ca.bodyIndex.get(m.target)!;
    const dx = p[2 * j]! - p[2 * ship]!;
    const dy = p[2 * j + 1]! - p[2 * ship + 1]!;
    if (m.kind === 'opnav') {
      res[c++] = Math.atan2(dy, dx) + val(ca, ca.cam, x);
      if (m.z.length > 1) res[c++] = Math.sqrt(dx * dx + dy * dy);
    } else if (m.kind === 'range') {
      res[c++] = Math.sqrt(dx * dx + dy * dy);
    } else {
      res[c++] = -dx;
      res[c++] = -dy;
    }
  }
  return res;
}

/** Ship state (x, y, vx, vy) and ship position relative to body 0 at the given times. */
export function shipStates(
  ca: CompiledArc,
  x: ArrayLike<number>,
  times: readonly number[],
  dt: number,
): { state: Float64Array[]; rel: Float64Array[] } {
  const order = times.map((t, i) => [t, i] as const).sort((a, b) => a[0] - b[0]);
  const traj = simulate(
    ca,
    x,
    order.map((o) => o[0]),
    dt,
  );
  const ship = ca.nb;
  const state: Float64Array[] = new Array(times.length);
  const rel: Float64Array[] = new Array(times.length);
  order.forEach(([, i], k) => {
    const p = traj.pos[k]!;
    const v = traj.vel[k]!;
    state[i] = Float64Array.of(p[2 * ship]!, p[2 * ship + 1]!, v[2 * ship]!, v[2 * ship + 1]!);
    rel[i] = Float64Array.of(p[2 * ship]! - p[0]!, p[2 * ship + 1]! - p[1]!);
  });
  return { state, rel };
}
